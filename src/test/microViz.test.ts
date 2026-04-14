import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildVizFrame } from '../viz/llmViz/frame'
import { buildMicroVizLayout } from '../viz/microViz/layout'
import {
  applyMicroVizPhase,
  buildMicroVizPhaseState,
  createMicroVizTextures,
  drawMicroVizEdges,
  uploadMicroVizFrame,
} from '../viz/microViz/bridge'
import { inferencePhases } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

const {
  createBufferTexMock,
  writeToBufferTexMock,
  addLineMock,
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
  addLineMock: vi.fn(),
}))

vi.mock('../vendor/llmVizOriginal/utils/renderPhases', () => ({
  createBufferTex: createBufferTexMock,
  writeToBufferTex: writeToBufferTexMock,
}))

vi.mock('../vendor/llmVizOriginal/llm/render/lineRender', () => ({
  addLine: addLineMock,
}))

const bundle = loadBundle()
const tokenLabel = (tokenId: number) =>
  tokenId === 26 ? 'BOS' : bundle.vocab[tokenId] ?? String(tokenId)

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
    expect(layout.blocks['norm-1'].cube.name).toBe('rmsnorm 1')
    expect(layout.blocks['norm-2'].cube.name).toBe('rmsnorm 2')
    expect(layout.blocks['q-project'].cube.name).toBe('Wq')
    expect(layout.blocks['mlp-fc1'].cube.name).toBe('fc1')
    expect(layout.blocks.sample.cube.name).toBe('sample / stop')
    expect(layout.edges.some((edge) => edge.id === 'probabilities-to-sample')).toBe(
      true,
    )
  })

  it('maps walkthrough phases onto microgpt blocks, edges, and bindings', () => {
    const trace = makeTrace()
    const contextTokens = ['BOS', 'e', 'm']
    const layout = buildMicroVizLayout(bundle)

    const qkvFrame = buildVizFrame(
      trace,
      inferencePhases[4],
      bundle,
      contextTokens,
      tokenLabel,
    )
    const qkvPhaseState = buildMicroVizPhaseState(
      inferencePhases[4],
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

    const mlpFrame = buildVizFrame(
      trace,
      inferencePhases[9],
      bundle,
      contextTokens,
      tokenLabel,
    )
    const mlpPhaseState = buildMicroVizPhaseState(
      inferencePhases[9],
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
      inferencePhases[6],
      bundle,
      ['BOS', 'e', 'm'],
      tokenLabel,
    )
    const phaseState = buildMicroVizPhaseState(
      inferencePhases[6],
      frame,
      layout,
    )
    const ctx: {
      renderState: { gl: WebGL2RenderingContext; lineRender: object; sharedRender: object }
      layout: ReturnType<typeof buildMicroVizLayout>
      textures: ReturnType<typeof createMicroVizTextures>
      camera: { desiredCamera: unknown }
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
    }

    uploadMicroVizFrame(
      ctx as unknown as Parameters<typeof uploadMicroVizFrame>[0],
      bundle,
      phaseState,
      trace,
      3,
    )

    expect(textures.dynamicTextures['context-mask'].localBuffer?.slice(0, 4)).toEqual(
      Float32Array.from([1, 1, 1, 0]),
    )
    expect(textures.dynamicTextures['x-after-embed'].localBuffer).toEqual(
      Float32Array.from(trace.xAfterEmbed),
    )
    expect(textures.dynamicTextures['attention-head-1-weights'].localBuffer?.slice(0, 3)).toEqual(
      Float32Array.from(trace.heads[0]!.weights),
    )
    expect(textures.dynamicTextures.sample.localBuffer?.[trace.sampledTokenId]).toBe(1)
    expect(layout.blocks['token-embedding'].cube.access?.src).toBe(textures.staticTextures.wte)
    expect(layout.blocks['attention-head-1'].cube.access?.src).toBe(
      textures.dynamicTextures['attention-head-1-weights'],
    )
    expect(layout.blocks.probabilities.cube.access?.src).toBe(
      textures.dynamicTextures.probs,
    )
  })

  it('applies phase focus and connector emphasis to the bridged scene', () => {
    const layout = buildMicroVizLayout(bundle)
    const frame = buildVizFrame(
      makeTrace(),
      inferencePhases[4],
      bundle,
      ['BOS', 'e', 'm'],
      tokenLabel,
    )
    const phaseState = buildMicroVizPhaseState(
      inferencePhases[4],
      frame,
      layout,
    )
    const ctx: {
      renderState: { lineRender: object; sharedRender: object }
      layout: ReturnType<typeof buildMicroVizLayout>
      camera: { desiredCamera?: unknown }
    } = {
      renderState: {
        lineRender: {},
        sharedRender: {},
      },
      layout,
      camera: {},
    }

    applyMicroVizPhase(
      ctx as unknown as Parameters<typeof applyMicroVizPhase>[0],
      phaseState,
    )

    expect(layout.blocks['q-project'].cube.opacity).toBe(1)
    expect(layout.blocks['q-project'].cube.highlight).toBe(1)
    expect(layout.blocks.context.cube.opacity).toBe(0.2)
    expect(ctx.camera.desiredCamera).toBe(layout.cameraPoses.attention)

    drawMicroVizEdges(
      ctx as unknown as Parameters<typeof drawMicroVizEdges>[0],
      phaseState,
    )

    expect(addLineMock).toHaveBeenCalledTimes(layout.edges.length)
    expect(addLineMock).toHaveBeenCalledWith(
      ctx.renderState.lineRender,
      2.4,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    )
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
