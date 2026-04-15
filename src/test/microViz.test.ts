import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildVizFrame } from '../viz/llmViz/frame'
import { buildMicroVizLayout } from '../viz/microViz/layout'
import {
  applyMicroVizPhase,
  buildMicroVizPhaseState,
  createMicroVizTextures,
  uploadMicroVizFrame,
} from '../viz/microViz/bridge'
import {
  shouldUpdateDesiredCamera,
} from '../viz/microViz/program'
import { inferencePhases } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

const {
  createBufferTexMock,
  writeToBufferTexMock,
} = vi.hoisted(() => ({
  createBufferTexMock: vi.fn(
    (_gl: unknown, width: number, height: number, channels: number) => ({
      width,
      height,
      channels,
      texture: { width, height, channels },
      localBuffer: undefined as Float32Array | undefined,
    }),
  ),
  writeToBufferTexMock: vi.fn(
    (
      _gl: unknown,
      buffer: {
        width: number
        height: number
        channels: number
        localBuffer?: Float32Array
      },
      data: Float32Array,
    ) => {
      buffer.localBuffer = Float32Array.from(data)
    },
  ),
}))

vi.mock('../vendor/llmVizOriginal/utils/renderPhases', () => ({
  createBufferTex: createBufferTexMock,
  writeToBufferTex: writeToBufferTexMock,
}))

const bundle = loadBundle()
const tokenLabel = (tokenId: number) =>
  tokenId === 26 ? 'BOS' : bundle.vocab[tokenId] ?? String(tokenId)
const phaseById = (id: (typeof inferencePhases)[number]['id']) =>
  inferencePhases.find((phase) => phase.id === id)!

function walkFiles(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const path = resolve(dir, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      walkFiles(path, out)
      continue
    }
    out.push(path)
  }
  return out
}

function makeGlStub() {
  return {
    TEXTURE_2D: 0x0de1,
    FLOAT: 0x1406,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    RED: 0x1903,
    R32F: 0x822e,
    RG: 0x8227,
    RG32F: 0x8230,
    RGB: 0x1907,
    RGB32F: 0x8815,
    RGBA: 0x1908,
    RGBA32F: 0x8814,
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    texSubImage2D: vi.fn(),
  } as unknown as WebGL2RenderingContext
}

describe('micro viz bridge', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('builds a literal microgpt layout with the expected blocks and parameter count', () => {
    const layout = buildMicroVizLayout(bundle)

    expect(layout.shape.nBlocks).toBe(1)
    expect(layout.shape.nHeads).toBe(4)
    expect(layout.shape.C).toBe(16)
    expect(layout.shape.T).toBe(16)
    expect(layout.shape.vocabSize).toBe(27)
    expect(layout.weightCount).toBe(4192)
    expect(layout.blockMap['norm-1'].cube.name).toBe('rmsnorm 1')
    expect(layout.blockMap['norm-2'].cube.name).toBe('rmsnorm 2')
    expect(layout.blockMap['q-project'].cube.name).toBe('Q weights')
    expect(layout.blockMap['mlp-fc1'].cube.name).toBe('fc1')
    expect(layout.blockMap['lm-head-weight'].cube.name).toBe('lm head')
    expect(layout.blockMap['softmax-max'].cube.name).toBe('softmax max')
    expect(layout.blockMap['softmax-exp'].cube.name).toBe('softmax exp')
    expect(layout.blockMap.sample.cube.name).toBe('sample / stop')
    expect(layout.blocks).toHaveLength(1)
    expect(layout.outputLabel.cubes).toContain(layout.logitsSoftmax)
    expect(layout.edges.some((edge) => edge.id === 'probabilities-to-sample')).toBe(
      true,
    )
    expect(layout.transformerBlocks).toHaveLength(1)
    expect(layout.model.inputTokens.localBuffer).toHaveLength(16)
  })

  it('stacks the MLP stages without vertical collisions', () => {
    const layout = buildMicroVizLayout(bundle)
    const fc1 = layout.blockMap['mlp-fc1'].cube
    const relu = layout.blockMap['mlp-relu'].cube
    const fc2 = layout.blockMap['mlp-fc2'].cube

    expect(relu.y).toBeGreaterThanOrEqual(fc1.y + fc1.dy + 12)
    expect(fc2.y).toBeGreaterThanOrEqual(relu.y + relu.dy + 12)
  })

  it('maps walkthrough phases onto microgpt blocks, edges, and bindings', () => {
    const trace = makeTrace()
    const contextTokens = ['BOS', 'e', 'm']
    const layout = buildMicroVizLayout(bundle)

    const qkvFrame = buildVizFrame(
      trace,
      phaseById('qkv'),
      bundle,
      contextTokens,
      tokenLabel,
    )
    const qkvPhaseState = buildMicroVizPhaseState(
      phaseById('qkv'),
      qkvFrame,
      layout,
    )

    expect(qkvPhaseState.focusBlockIds).toEqual([
      'q-project',
      'k-project',
      'v-project',
    ])
    expect(qkvPhaseState.emphasisEdgeIds).toContain('norm-1-to-q-project')
    expect(qkvPhaseState.blockBindings['q-project']?.key).toBe('layer0.attn_wq')
    expect(qkvPhaseState.blockBindings['k-project']?.key).toBe('layer0.attn_wk')
    expect(qkvPhaseState.blockBindings['v-project']?.key).toBe('layer0.attn_wv')
    expect(qkvPhaseState.blockBindings['attention-head-1']?.key).toBe('attention-head-1-q')

    const mlpFrame = buildVizFrame(
      trace,
      phaseById('mlp'),
      bundle,
      contextTokens,
      tokenLabel,
    )
    const mlpPhaseState = buildMicroVizPhaseState(
      phaseById('mlp'),
      mlpFrame,
      layout,
    )

    expect(mlpPhaseState.focusBlockIds).toEqual(['mlp-fc1', 'mlp-relu', 'mlp-fc2'])
    expect(mlpPhaseState.blockBindings['mlp-fc1']?.key).toBe('layer0.mlp_fc1')
    expect(mlpPhaseState.blockBindings['mlp-fc2']?.key).toBe('layer0.mlp_fc2')
  })

  it('uploads microgpt weights and dynamic trace tensors into renderer textures', () => {
    const gl = makeGlStub()
    const layout = buildMicroVizLayout(bundle)
    const textures = createMicroVizTextures(gl, bundle)

    expect(createBufferTexMock).toHaveBeenCalled()
    expect(textures.staticTextures.wte.width).toBe(16)
    expect(textures.staticTextures.wte.height).toBe(27)
    expect(textures.staticTextures['layer0.attn_wq'].width).toBe(16)
    expect(textures.staticTextures['layer0.mlp_fc1'].height).toBe(64)
    expect(textures.staticTextures.lm_head.height).toBe(27)

    const trace = makeTrace()
    const frame = buildVizFrame(
      trace,
      phaseById('attention-softmax'),
      bundle,
      ['BOS', 'e', 'm'],
      tokenLabel,
    )
    const phaseState = buildMicroVizPhaseState(
      phaseById('attention-softmax'),
      frame,
      layout,
    )
    const ctx: {
      renderState: { gl: WebGL2RenderingContext; lineRender: object; sharedRender: object }
      layout: ReturnType<typeof buildMicroVizLayout>
      textures: ReturnType<typeof createMicroVizTextures>
      camera: { desiredCamera: unknown }
      currentSceneOffset: { dist: (other: unknown) => number }
      targetSceneOffset: { dist: (other: unknown) => number }
      currentCardOffset: { dist: (other: unknown) => number }
      targetCardOffset: { dist: (other: unknown) => number }
      offsetTransition: null
    } = {
      renderState: {
        gl,
        lineRender: {},
        sharedRender: {},
      },
      layout,
      textures,
      camera: {
        desiredCamera: null,
      },
      currentSceneOffset: { dist: () => 0 },
      targetSceneOffset: { dist: () => 0 },
      currentCardOffset: { dist: () => 0 },
      targetCardOffset: { dist: () => 0 },
      offsetTransition: null,
    }

    uploadMicroVizFrame(
      ctx as unknown as Parameters<typeof uploadMicroVizFrame>[0],
      bundle,
      phaseState,
      trace,
      ['BOS', 'e', 'm'],
    )

    expect(textures.dynamicTextures.context.localBuffer?.slice(0, 4)).toEqual(
      Float32Array.from([1, 4 / 26, 12 / 26, 1]),
    )
    expect(textures.dynamicTextures['residual-grid'].localBuffer?.length).toBe(256)
    const tokenEmbedding = Array.from(bundle.weights.wte.data.slice(4 * 16, 5 * 16))
    const positionEmbedding = Array.from(bundle.weights.wpe.data.slice(1 * 16, 2 * 16))
    const positionOneResidual = tokenEmbedding.map(
      (value, index) => value + positionEmbedding[index]!,
    )
    const norm1MeanSquare = positionOneResidual.reduce(
      (sum, value) => sum + value * value,
      0,
    ) / positionOneResidual.length
    const norm1Rms = Math.sqrt(norm1MeanSquare + 1e-5)
    expect(textures.dynamicTextures['norm1-agg-ms'].localBuffer?.[1]).toBeCloseTo(
      norm1MeanSquare,
      6,
    )
    expect(textures.dynamicTextures['norm1-agg-rms'].localBuffer?.[1]).toBeCloseTo(
      norm1Rms,
      6,
    )
    const weightRowStart = trace.positionId * bundle.config.blockSize
    expect(
      textures.dynamicTextures['attention-head-1-weights'].localBuffer?.slice(
        weightRowStart,
        weightRowStart + 4,
      ),
    ).toEqual(
      Float32Array.from([
        trace.heads[0]!.weights[0]!,
        trace.heads[0]!.weights[1]!,
        trace.heads[0]!.weights[2]!,
        0,
      ]),
    )
    expect(textures.dynamicTextures['sample-grid'].localBuffer?.[trace.positionId]).toBe(1)
    expect(textures.dynamicTextures['logits-grid'].localBuffer?.[trace.positionId]).toBeCloseTo(
      trace.logits[0]!,
      6,
    )
    expect(
      textures.dynamicTextures['logits-grid'].localBuffer?.[
        bundle.config.blockSize + trace.positionId
      ],
    ).toBeCloseTo(trace.logits[1]!, 6)
    expect(textures.dynamicTextures['probs-grid'].localBuffer?.[trace.positionId]).toBeCloseTo(
      trace.probs[0]!,
      6,
    )
    expect(layout.blockMap['token-embedding'].cube.access?.src).toBe(textures.staticTextures.wte)
    expect(layout.blockMap['attention-head-1'].cube.access?.src).toBe(
      textures.dynamicTextures['attention-head-1-weights'],
    )
    expect(layout.blockMap.probabilities.cube.access?.src).toBe(
      textures.dynamicTextures['probs-grid'],
    )
    expect(layout.transformerBlocks[0]?.ln1.lnAgg1.access?.src).toBe(
      textures.dynamicTextures['norm1-agg-ms'],
    )
    expect(layout.transformerBlocks[0]?.ln1.lnAgg2.access?.src).toBe(
      textures.dynamicTextures['norm1-agg-rms'],
    )
    expect(layout.transformerBlocks[0]?.ln2.lnAgg1.access?.src).toBe(
      textures.dynamicTextures['norm2-agg-ms'],
    )
    expect(layout.transformerBlocks[0]?.ln2.lnAgg2.access?.src).toBe(
      textures.dynamicTextures['norm2-agg-rms'],
    )
    expect(layout.logitsAgg1.access?.src).toBe(textures.dynamicTextures['softmax-exp'])
    expect(layout.logitsAgg2.access?.src).toBe(textures.dynamicTextures['softmax-max'])
    expect(layout.transformerBlocks[0]?.ln1.lnAgg1.access?.src).not.toBe(
      textures.dynamicTextures.context,
    )
    expect(layout.transformerBlocks[0]?.ln2.lnAgg1.access?.src).not.toBe(
      textures.dynamicTextures['sample-grid'],
    )
    expect(layout.logitsAgg1.access?.src).not.toBe(textures.dynamicTextures['sample-grid'])
    const maxLogit = Math.max(...trace.logits)
    const expSum = trace.logits.reduce((sum, value) => sum + Math.exp(value - maxLogit), 0)
    expect(textures.dynamicTextures['softmax-max'].localBuffer?.[trace.positionId]).toBeCloseTo(
      maxLogit,
      6,
    )
    expect(textures.dynamicTextures['softmax-exp'].localBuffer?.[trace.positionId]).toBeCloseTo(
      expSum,
      6,
    )
    expect(layout.model.inputLen).toBe(3)
  })

  it('applies phase focus and connector emphasis to the bridged scene', () => {
    const layout = buildMicroVizLayout(bundle)
    const frame = buildVizFrame(
      makeTrace(),
      phaseById('qkv'),
      bundle,
      ['BOS', 'e', 'm'],
      tokenLabel,
    )
    const phaseState = buildMicroVizPhaseState(
      phaseById('qkv'),
      frame,
      layout,
    )
    const ctx: {
      renderState: { lineRender: object; sharedRender: object }
      layout: ReturnType<typeof buildMicroVizLayout>
      camera: { desiredCamera?: unknown }
      currentSceneOffset: typeof phaseState.sceneOffset
      targetSceneOffset: typeof phaseState.sceneOffset
      currentCardOffset: typeof phaseState.cardOffset
      targetCardOffset: typeof phaseState.cardOffset
      offsetTransition: null
    } = {
      renderState: {
        lineRender: {},
        sharedRender: {},
      },
      layout,
      camera: {},
      currentSceneOffset: phaseState.sceneOffset.clone(),
      targetSceneOffset: phaseState.sceneOffset.clone(),
      currentCardOffset: phaseState.cardOffset.clone(),
      targetCardOffset: phaseState.cardOffset.clone(),
      offsetTransition: null,
    }

    applyMicroVizPhase(
      ctx as unknown as Parameters<typeof applyMicroVizPhase>[0],
      phaseState,
    )

    expect(layout.blockMap['q-project'].cube.opacity).toBeGreaterThan(0.9)
    expect(layout.blockMap['q-project'].cube.highlight).toBeGreaterThan(0.39)
    expect(layout.blockMap.context.cube.opacity).toBeGreaterThan(0.8)
    expect(ctx.camera.desiredCamera).toBeUndefined()

    expect(phaseState.emphasisEdgeIds).toContain('norm-1-to-q-project')
    expect(phaseState.hoverBlockIndices.length).toBeGreaterThan(0)
  })

  it('uses the live walkthrough phase ids for attention-softmax and attention output emphasis', () => {
    const layout = buildMicroVizLayout(bundle)
    const softmaxPhaseState = buildMicroVizPhaseState(
      phaseById('attention-softmax'),
      buildVizFrame(makeTrace(), phaseById('attention-softmax'), bundle, ['BOS', 'e', 'm'], tokenLabel),
      layout,
    )
    const ctx: {
      renderState: { lineRender: object; sharedRender: object }
      layout: ReturnType<typeof buildMicroVizLayout>
      camera: { desiredCamera?: unknown }
      currentSceneOffset: typeof softmaxPhaseState.sceneOffset
      targetSceneOffset: typeof softmaxPhaseState.sceneOffset
      currentCardOffset: typeof softmaxPhaseState.cardOffset
      targetCardOffset: typeof softmaxPhaseState.cardOffset
      offsetTransition: null
    } = {
      renderState: {
        lineRender: {},
        sharedRender: {},
      },
      layout,
      camera: {},
      currentSceneOffset: softmaxPhaseState.sceneOffset.clone(),
      targetSceneOffset: softmaxPhaseState.sceneOffset.clone(),
      currentCardOffset: softmaxPhaseState.cardOffset.clone(),
      targetCardOffset: softmaxPhaseState.cardOffset.clone(),
      offsetTransition: null,
    }
    applyMicroVizPhase(
      ctx as unknown as Parameters<typeof applyMicroVizPhase>[0],
      softmaxPhaseState,
    )
    expect(layout.transformerBlocks[0]?.selfAttendLabel.visible).toBe(1)
    expect(layout.transformerBlocks[0]?.heads[0]?.mtxLabel.visible).toBe(1)

    const attnOutPhaseState = buildMicroVizPhaseState(
      phaseById('attn-out'),
      buildVizFrame(makeTrace(), phaseById('attn-out'), bundle, ['BOS', 'e', 'm'], tokenLabel),
      layout,
    )
    applyMicroVizPhase(
      ctx as unknown as Parameters<typeof applyMicroVizPhase>[0],
      attnOutPhaseState,
    )
    expect(layout.transformerBlocks[0]?.selfAttendLabel.visible).toBe(1)
    expect(layout.transformerBlocks[0]?.projLabel.visible).toBe(1)

    const lmHeadPhaseState = buildMicroVizPhaseState(
      phaseById('lm-head'),
      buildVizFrame(makeTrace(), phaseById('lm-head'), bundle, ['BOS', 'e', 'm'], tokenLabel),
      layout,
    )
    expect(lmHeadPhaseState.dimHover).toBeDefined()
    expect(lmHeadPhaseState.topOutputOpacity).toBe(1)

    const head = layout.transformerBlocks[0]?.heads[0]
    if (!head) {
      throw new Error('Expected the first attention head to exist')
    }
    head.biasLabel.visible = 1
    applyMicroVizPhase(
      ctx as unknown as Parameters<typeof applyMicroVizPhase>[0],
      lmHeadPhaseState,
    )
    expect(head.biasLabel.visible).toBe(0)
  })

  it('only updates desired camera when the phase target materially changes', () => {
    const trace = makeTrace()
    const contextTokens = ['BOS', 'e', 'm']
    const layout = buildMicroVizLayout(bundle)
    const qkvState = buildMicroVizPhaseState(
      phaseById('qkv'),
      buildVizFrame(trace, phaseById('qkv'), bundle, contextTokens, tokenLabel),
      layout,
    )
    const scoreState = buildMicroVizPhaseState(
      phaseById('attention-scores'),
      buildVizFrame(trace, phaseById('attention-scores'), bundle, contextTokens, tokenLabel),
      layout,
    )
    const attnOutState = buildMicroVizPhaseState(
      phaseById('attn-out'),
      buildVizFrame(trace, phaseById('attn-out'), bundle, contextTokens, tokenLabel),
      layout,
    )
    const mlpState = buildMicroVizPhaseState(
      phaseById('mlp'),
      buildVizFrame(trace, phaseById('mlp'), bundle, contextTokens, tokenLabel),
      layout,
    )
    const sampleState = buildMicroVizPhaseState(
      phaseById('append-or-stop'),
      buildVizFrame(trace, phaseById('append-or-stop'), bundle, contextTokens, tokenLabel),
      layout,
    )

    expect(qkvState.cameraPoseId).toBe(scoreState.cameraPoseId)
    expect(shouldUpdateDesiredCamera(qkvState, scoreState)).toBe(false)
    expect(qkvState.cameraTarget.center.x).toBeCloseTo(scoreState.cameraTarget.center.x, 5)
    expect(qkvState.cameraTarget.center.y).toBeCloseTo(scoreState.cameraTarget.center.y, 5)
    expect(qkvState.cameraTarget.center.z).toBeCloseTo(scoreState.cameraTarget.center.z, 5)
    expect(qkvState.cameraTarget.angle.z).toBeCloseTo(scoreState.cameraTarget.angle.z, 5)
    expect(attnOutState.cameraPoseId).toBe(mlpState.cameraPoseId)
    expect(shouldUpdateDesiredCamera(attnOutState, mlpState)).toBe(true)
    expect(shouldUpdateDesiredCamera(scoreState, sampleState)).toBe(true)
  })

  it('anchors the tokenize phase around the full model overview', () => {
    const layout = buildMicroVizLayout(bundle)
    const tokenizeState = buildMicroVizPhaseState(
      inferencePhases[0],
      buildVizFrame(makeTrace(), inferencePhases[0], bundle, ['BOS'], tokenLabel),
      layout,
    )

    expect(tokenizeState.cameraPoseId).toBe('overview')
    expect(tokenizeState.cameraTarget.center.x).toBeCloseTo(layout.cameraPoses.overview.center.x, 5)
    expect(tokenizeState.cameraTarget.center.y).toBeCloseTo(layout.cameraPoses.overview.center.y, 5)
    expect(tokenizeState.cameraTarget.center.z).toBeCloseTo(layout.cameraPoses.overview.center.z, 5)
    expect(tokenizeState.cameraTarget.angle.x).toBeCloseTo(layout.cameraPoses.overview.angle.x, 5)
    expect(tokenizeState.cameraTarget.angle.y).toBeCloseTo(layout.cameraPoses.overview.angle.y, 5)
    expect(tokenizeState.cameraTarget.angle.z).toBeCloseTo(layout.cameraPoses.overview.angle.z, 5)
  })

  it('keeps nano-gpt assets out of the live app code path', () => {
    const appFiles = walkFiles(resolve(process.cwd(), 'src')).filter(
      (path) =>
        !path.includes(`${resolve(process.cwd(), 'src/vendor')}`) &&
        !path.includes(`${resolve(process.cwd(), 'src/test')}`) &&
        (path.endsWith('.ts') || path.endsWith('.tsx')),
    )

    for (const path of appFiles) {
      const source = readFileSync(path, 'utf8')
      expect(source.includes('gpt-nano-sort')).toBe(false)
      expect(source.includes('nano-gpt')).toBe(false)
    }

    const sceneSource = readFileSync(
      resolve(process.cwd(), 'src/components/ArchitectureScene.tsx'),
      'utf8',
    )
    expect(sceneSource.includes("../vendor/llmVizOriginal/llm/LayerView")).toBe(false)
    expect(sceneSource.includes("from '../vendor/llmVizOriginal/llm/walkthrough/Walkthrough'")).toBe(
      false,
    )
  })
})
