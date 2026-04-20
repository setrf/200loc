import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAttentionSurface,
  buildContextSlots,
  buildTensorWindow,
  buildVectorSurface,
  buildVizFrame,
  buildWeightSurface,
} from '../viz/llmViz/frame'
import {
  buildMicrogptLayout,
  getCameraPose,
  getLayoutNodeMap,
  getNodeFrontLabelPosition,
  getNodeSubtitlePosition,
  getProjectedScale,
  lerpCameraPose,
  projectScene,
} from '../viz/llmViz/layout'
import { getPickFocusId, VizRenderer } from '../viz/llmViz/renderer'
import { inferencePhases } from '../walkthrough/phases'
import { loadBundle, loadModelConfig, makeTrace } from './helpers/fixtures'

const bundle = loadBundle()
const modelConfig = loadModelConfig()
const tokenLabel = (tokenId: number) => (tokenId === 26 ? 'BOS' : bundle.vocab[tokenId] ?? String(tokenId))
const phaseById = (id: (typeof inferencePhases)[number]['id']) =>
  inferencePhases.find((phase) => phase.id === id)!

function makeCanvas() {
  return document.createElement('canvas')
}

function make2dContext() {
  return {
    setTransform() {},
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    closePath() {},
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  }
}

function makeWebGlContext() {
  return {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STREAM_DRAW: 0x88e0,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLES: 0x0004,
    LINES: 0x0001,
    FLOAT: 0x1406,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniform2f: vi.fn(),
    drawArrays: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    viewport: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
  }
}

describe('llm viz helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('builds a deterministic microgpt layout and projects it into the viewport', () => {
    const layout = buildMicrogptLayout(modelConfig)
    expect(layout.nodes).toHaveLength(17)
    expect(layout.edges).toHaveLength(20)

    const projected = projectScene(layout, getCameraPose('attention'), 760, 820)
    expect(projected.nodeMap.context.bounds.minY).toBeLessThan(
      projected.nodeMap.sample.bounds.minY,
    )
    expect(projected.edgeMap['norm-1-to-qkv'].start.y).toBeLessThan(
      projected.edgeMap['norm-1-to-qkv'].end.y,
    )

    const smallerLayout = buildMicrogptLayout({ ...modelConfig, nHead: 2 })
    expect(
      smallerLayout.nodes.filter((node) => node.id.startsWith('attention-head-')),
    ).toHaveLength(2)
    expect(Object.keys(getLayoutNodeMap(smallerLayout))).toContain('context')
  })

  it('interpolates camera poses and computes scale', () => {
    const pose = lerpCameraPose(getCameraPose('input'), getCameraPose('sample'), 0.5)
    expect(pose.scale).toBeGreaterThan(getCameraPose('input').scale)
    expect(getProjectedScale(760, 820, pose)).toBeGreaterThan(0)
  })

  it('computes projected label positions from the front face', () => {
    const layout = buildMicrogptLayout(modelConfig)
    const projected = projectScene(layout, getCameraPose('overview'), 760, 820)
    const node = projected.nodes[0]!

    expect(getNodeFrontLabelPosition(node)).toEqual({
      x: node.front[0]![0] + 14,
      y: node.front[0]![1] + 24,
    })
    expect(getNodeSubtitlePosition(node)).toEqual({
      x: node.front[0]![0] + 14,
      y: node.front[0]![1] + 42,
    })
  })

  it('builds tensor helpers with exact dimensions and highlights', () => {
    const wte = buildWeightSurface(
      'wte',
      bundle.weights.wte,
      bundle.vocab.map((_, index) => tokenLabel(index)),
      Array.from({ length: modelConfig.nEmbd }, (_, index) => `d${index}`),
      { highlightedRows: [12] },
    )
    expect(wte.rows).toBe(27)
    expect(wte.cols).toBe(16)
    expect(wte.highlightedRows).toContain(12)

    const vector = buildVectorSurface('logits', 'logits', makeTrace().logits, {
      itemLabels: bundle.vocab.map((_, index) => tokenLabel(index)),
    })
    expect(vector.values).toHaveLength(27)

    const defaultVector = buildVectorSurface('mini', 'mini', [1, 2, 3])
    expect(defaultVector.itemLabels).toEqual(['d0', 'd1', 'd2'])

    const attention = buildAttentionSurface(0, 'weights', [0.1, 0.7, 0.2], ['p0', 'p1', 'p2'], 'sequential')
    expect(attention.surface.rows).toBe(1)
    expect(attention.surface.cols).toBe(3)
    expect(attention.result.highlightedIndices).toEqual([1])

    const emptyAttention = buildAttentionSurface(1, 'weights', [], [], 'sequential')
    expect(emptyAttention.result.highlightedIndices).toEqual([])
  })

  it('builds phase-specific tensor windows and full viz frames', () => {
    const trace = makeTrace()
    const contextTokens = ['BOS', 'e', 'm']

    const tokenWindow = buildTensorWindow(
      trace,
      inferencePhases[3],
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(tokenWindow.surfaces[0].label).toBe('token meaning table')
    expect(tokenWindow.surfaces[0].rows).toBe(27)
    expect(tokenWindow.vectors[0].values).toHaveLength(16)

    const qkvWindow = buildTensorWindow(
      trace,
      inferencePhases[9],
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(qkvWindow.surfaces.map((surface) => surface.label)).toEqual([
      'query weight table',
      'key weight table',
      'value weight table',
    ])
    expect(qkvWindow.projection?.outputs).toHaveLength(3)

    const mlpWindow = buildTensorWindow(
      trace,
      inferencePhases[22],
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(mlpWindow.surfaces[0].rows).toBe(64)
    expect(mlpWindow.surfaces[0].cols).toBe(16)
    expect(mlpWindow.surfaces[1].rows).toBe(16)
    expect(mlpWindow.surfaces[1].cols).toBe(64)

    const logitsWindow = buildTensorWindow(
      trace,
      inferencePhases[26],
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(logitsWindow.surfaces[0].label).toBe('vocabulary scoring table')
    expect(logitsWindow.vectors[1].values).toHaveLength(27)

    const sampleWindow = buildTensorWindow(
      makeTrace({ sampledTokenId: 26 }),
      inferencePhases[33],
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(sampleWindow.lookups?.[0].description).toBe('Treat this as the stop marker and end the loop.')

    const weightedValuesWindow = buildTensorWindow(
      makeTrace({
        heads: makeTrace().heads.map((head) => ({
          ...head,
          weights: [],
          vSlices: [],
        })),
      }),
      phaseById('weighted-values'),
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(weightedValuesWindow.attention?.every((item) => item.surface.highlightedRows?.length === 0)).toBe(
      true,
    )

    const attentionFrame = buildVizFrame(
      trace,
      phaseById('attention-scores'),
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(attentionFrame.overlay.kind).toBe('attention-scores')
    if (attentionFrame.overlay.kind === 'attention-scores') {
      expect(attentionFrame.overlay.attentionReads).toHaveLength(4)
      expect(attentionFrame.overlay.focusWindow.attention).toHaveLength(4)
      expect(attentionFrame.overlay.slots[2].isCurrent).toBe(true)
    }

    const sparseAttentionFrame = buildVizFrame(
      makeTrace({
        heads: makeTrace().heads.map((head, index) => ({
          ...head,
          weights: index === 0 ? [0.6] : [],
        })),
      }),
      phaseById('attention-softmax'),
      bundle,
      ['BOS', 'e', 'm'],
      tokenLabel,
    )
    if (sparseAttentionFrame.overlay.kind === 'attention-weights') {
      expect(sparseAttentionFrame.overlay.slots.map((slot) => slot.emphasis)).toEqual([
        0.15,
        0,
        0,
      ])
      expect(sparseAttentionFrame.overlay.attentionReads[1]?.targetLabel).toBe('p0:BOS')
    }

    const contextFrame = buildVizFrame(
      makeTrace({ heads: [], positionId: 0, tokenId: 26 }),
      inferencePhases[0],
      bundle,
      ['BOS'],
      tokenLabel,
    )
    expect(contextFrame.overlay.kind).toBe('context-cache')
    if (contextFrame.overlay.kind === 'context-cache') {
      expect(contextFrame.overlay.focusWindow.title).toBe('Readable history for this moment')
      expect(contextFrame.overlay.slots[0].isCurrent).toBe(true)
    }

    const probabilitiesWindow = buildTensorWindow(
      makeTrace({ topCandidates: [], sampledTokenId: 7 }),
      phaseById('probabilities'),
      bundle,
      contextTokens,
      tokenLabel,
    )
    expect(probabilitiesWindow.note).toContain('Highest probability right now')

    const emptyAttentionFrame = buildVizFrame(
      makeTrace({ heads: [] }),
      phaseById('attention-scores'),
      bundle,
      [],
      tokenLabel,
    )
    expect(emptyAttentionFrame.emphasisNodeIds).toEqual(
      phaseById('attention-scores').viz.emphasisNodeIds,
    )

    const fifthHeadTemplate = makeTrace().heads[0]!
    const fallbackAttentionFrame = buildVizFrame(
      makeTrace({
        heads: Array.from({ length: 5 }, (_, index) => ({
          ...fifthHeadTemplate,
          weights: index === 4 ? [] : [0],
          q: [...fifthHeadTemplate.q],
          mixedValue: [...fifthHeadTemplate.mixedValue],
          kSlices: fifthHeadTemplate.kSlices.map((slice) => [...slice]),
          vSlices: fifthHeadTemplate.vSlices.map((slice) => [...slice]),
          scores: [...fifthHeadTemplate.scores],
        })),
      }),
      phaseById('attention-scores'),
      bundle,
      [],
      tokenLabel,
    )
    expect(fallbackAttentionFrame.emphasisNodeIds).toContain('attention-head-1')
    if (fallbackAttentionFrame.overlay.kind === 'attention-scores') {
      expect(fallbackAttentionFrame.overlay.attentionReads[4]).toMatchObject({
        headId: 'attention-head-1',
        targetLabel: 'p0',
      })
    }
  })

  it('builds context slots safely from sparse emphasis', () => {
    expect(
      buildContextSlots(['BOS', 'a'], 1, [null as unknown as number]),
    ).toEqual([
      { label: 'p0:BOS', emphasis: 0, isCurrent: false },
      { label: 'p1:a', emphasis: 0, isCurrent: true },
    ])
  })

  it('renders and picks through the projected 2d path', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      kind: string,
    ) {
      if (kind === '2d') {
        return make2dContext() as never
      }
      return null
    })

    let rafTick = 0
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafTick += 1
        callback(rafTick === 1 ? 1 : 301)
        return rafTick
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const renderer = new VizRenderer()
    const canvas = makeCanvas()
    const layout = buildMicrogptLayout(modelConfig)
    const frame = buildVizFrame(
      makeTrace(),
      phaseById('attention-scores'),
      bundle,
      ['BOS', 'e', 'm'],
      tokenLabel,
    )

    expect(renderer.mount(canvas, layout).mode).toBe('projected-2d')
    renderer.resize(760, 820)
    renderer.setFrame(frame)

    const projected = projectScene(layout, getCameraPose(frame.cameraPoseId), 760, 820)
    const pick = renderer.pick(
      projected.nodeMap['attention-head-2'].center.x,
      projected.nodeMap['attention-head-2'].center.y,
    )

    expect(pick).not.toBeNull()
    expect(getPickFocusId(pick!)).toBe('attention-head-2')

    const edge = projected.edgeMap['residual-stream-to-norm-1']
    const edgePick = renderer.pick(
      (edge.start.x + edge.end.x) / 2,
      (edge.start.y + edge.end.y) / 2,
    )
    expect(edgePick).not.toBeNull()
    expect(getPickFocusId(edgePick!)).toBe('residual-stream-to-norm-1')
    renderer.dispose()
  })

  it('uses the webgl2 path when available', () => {
    const gl = makeWebGlContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return gl as never
      }
      if (kind === '2d') {
        return make2dContext() as never
      }
      return null
    })

    let rafTick = 0
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafTick += 1
        callback(rafTick === 1 ? 1 : 301)
        return rafTick
      }),
    )
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const renderer = new VizRenderer()
    const mountResult = renderer.mount(makeCanvas(), buildMicrogptLayout(modelConfig))
    expect(mountResult.mode).toBe('webgl2')
    renderer.resize(760, 820)
    renderer.setFrame(
      buildVizFrame(
        makeTrace(),
        phaseById('attention-scores'),
        bundle,
        ['BOS', 'e', 'm'],
        tokenLabel,
      ),
    )
    expect(gl.drawArrays).toHaveBeenCalled()
    renderer.dispose()
    expect(gl.deleteProgram).toHaveBeenCalled()
  })

  it('falls back cleanly when webgl initialization or 2d contexts are unavailable', () => {
    const failingGl = {
      ...makeWebGlContext(),
      createShader: vi.fn(() => null),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return failingGl as never
      }
      return null
    })

    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const renderer = new VizRenderer()
    const canvas = makeCanvas()
    expect(renderer.mount(canvas, buildMicrogptLayout(modelConfig)).mode).toBe(
      'projected-2d',
    )
    renderer.resize(0, 0)
    renderer.setFrame(
      buildVizFrame(
        makeTrace(),
        inferencePhases[0],
        bundle,
        ['BOS'],
        tokenLabel,
      ),
    )
    expect(renderer.pick(0, 0)).toBeNull()
    renderer.dispose()
  })

  it('falls back when shader compilation, program linking, or uniform binding fails', () => {
    const makeFailingContext = (overrides: Record<string, unknown>) => ({
      ...makeWebGlContext(),
      ...overrides,
    })

    const compileFail = makeFailingContext({
      getShaderParameter: vi.fn(() => false),
      getShaderInfoLog: vi.fn(() => 'compile fail'),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return compileFail as never
      }
      return make2dContext() as never
    })
    expect(
      new VizRenderer().mount(makeCanvas(), buildMicrogptLayout(modelConfig)).mode,
    ).toBe('projected-2d')

    const linkFail = makeFailingContext({
      getProgramParameter: vi.fn(() => false),
      getProgramInfoLog: vi.fn(() => 'link fail'),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return linkFail as never
      }
      return make2dContext() as never
    })
    expect(
      new VizRenderer().mount(makeCanvas(), buildMicrogptLayout(modelConfig)).mode,
    ).toBe('projected-2d')

    const uniformFail = makeFailingContext({
      getUniformLocation: vi.fn(() => null),
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return uniformFail as never
      }
      return make2dContext() as never
    })
    expect(
      new VizRenderer().mount(makeCanvas(), buildMicrogptLayout(modelConfig)).mode,
    ).toBe('projected-2d')
  })

  it('handles resize before mount and misses during picking', () => {
    const renderer = new VizRenderer()
    renderer.resize(10, 10)
    expect(renderer.pick(1, 1)).toBeNull()
    expect(renderer.mode).toBe('projected-2d')
  })

  it('covers zero-length edge distance and no-hit picks on an existing scene', () => {
    const renderer = new VizRenderer()
    ;(renderer as unknown as { scene: unknown }).scene = {
      nodes: [],
      edges: [
        {
          id: 'norm-1-to-qkv',
          from: 'norm-1',
          to: 'qkv',
          start: { x: 10, y: 10 },
          end: { x: 10, y: 10 },
        },
      ],
    }

    expect(renderer.pick(10, 10)).toEqual({ kind: 'edge', id: 'norm-1-to-qkv' })
    expect(renderer.pick(300, 300)).toBeNull()
  })

  it('falls back when program or buffer allocation fails', () => {
    const noProgram = {
      ...makeWebGlContext(),
      createProgram: vi.fn(() => null),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return noProgram as never
      }
      return make2dContext() as never
    })
    expect(
      new VizRenderer().mount(makeCanvas(), buildMicrogptLayout(modelConfig)).mode,
    ).toBe('projected-2d')

    const noBuffer = {
      ...makeWebGlContext(),
      createBuffer: vi.fn(() => null),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementationOnce(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return noBuffer as never
      }
      return make2dContext() as never
    })
    expect(
      new VizRenderer().mount(makeCanvas(), buildMicrogptLayout(modelConfig)).mode,
    ).toBe('projected-2d')
  })
})
