import { rmsnorm } from '../../model/math'
import type { MatrixData, TokenStepTrace } from '../../model'
import type { PhaseDefinition } from '../../walkthrough/phases'
import type { VizEdgeId, VizFrame, VizNodeId } from '../llmViz/types'
import type {
  MicroVizBlockId,
  MicroVizEdgeId,
  MicroVizLayout,
  MicroVizPhaseState,
  MicroVizRenderContext,
  MicroVizStaticModel,
  MicroVizTextureBinding,
  MicroVizTextureSet,
} from './types'
import {
  createBufferTex,
  writeToBufferTex,
} from '../../vendor/llmVizOriginal/utils/renderPhases'
import { Vec3 } from '../../vendor/llmVizOriginal/utils/vector'
import { DimStyle } from '../../vendor/llmVizOriginal/llm/walkthrough/WalkthroughTools'

const headBlockIds: MicroVizBlockId[] = [
  'attention-head-1',
  'attention-head-2',
  'attention-head-3',
  'attention-head-4',
]

function maxAbs(values: ArrayLike<number>) {
  let best = 1e-6
  for (let index = 0; index < values.length; index += 1) {
    best = Math.max(best, Math.abs(values[index]!))
  }
  return best
}

function maxValue(values: ArrayLike<number>) {
  let best = 1e-6
  for (let index = 0; index < values.length; index += 1) {
    best = Math.max(best, values[index] ?? 0)
  }
  return best
}

function writeMatrixTexture(
  gl: WebGL2RenderingContext,
  textures: MicroVizTextureSet,
  key: string,
  matrix: MatrixData,
  scale = 1 / maxAbs(matrix.data),
) {
  const texture = createBufferTex(gl, matrix.cols, matrix.rows, 1)
  writeToBufferTex(gl, texture, matrix.data)
  textures.staticTextures[key] = texture
  textures.scales[key] = scale
}

function makeZeroGrid(width: number, height: number) {
  return new Float32Array(width * height)
}

function setColumn(buffer: Float32Array, width: number, values: ArrayLike<number>, column: number) {
  for (let row = 0; row < values.length; row += 1) {
    buffer[row * width + column] = values[row] ?? 0
  }
}

function setRow(buffer: Float32Array, width: number, values: readonly number[], row: number) {
  buffer.set(values.slice(0, width), row * width)
}

function meanSquare(values: ArrayLike<number>) {
  if (values.length === 0) {
    return 0
  }
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0
    total += value * value
  }
  return total / values.length
}

function rmsValue(values: ArrayLike<number>) {
  return Math.sqrt(meanSquare(values) + 1e-5)
}

function getRow(matrix: MatrixData, rowIndex: number) {
  const start = rowIndex * matrix.cols
  return matrix.data.slice(start, start + matrix.cols)
}

function tokenToId(token: string, model: MicroVizStaticModel) {
  if (token === 'BOS') {
    return model.config.bosToken
  }
  const tokenIndex = model.vocab.indexOf(token)
  return tokenIndex >= 0 ? tokenIndex : model.config.bosToken
}

function sortedProbPairs(trace: TokenStepTrace) {
  return trace.probs
    .map((prob, tokenId) => ({ tokenId, prob }))
    .sort((left, right) => right.prob - left.prob)
}

function buildCardModel(
  layout: MicroVizLayout,
  model: MicroVizStaticModel,
  trace: TokenStepTrace,
  contextTokens: string[],
) {
  const ids = contextTokens.map((token) => tokenToId(token, model))
  layout.model.inputTokens.localBuffer.fill(model.config.bosToken)
  layout.model.inputTokens.localBuffer.set(ids.slice(0, model.config.blockSize))
  layout.model.inputLen = Math.min(ids.length, model.config.blockSize)
  layout.model.sortedBuf.fill(0)

  const sorted = sortedProbPairs(trace)
  for (let position = 0; position < Math.max(0, layout.model.inputLen - 1); position += 1) {
    const nextTokenId = ids[position + 1] ?? model.config.bosToken
    layout.model.sortedBuf[(position * model.config.vocabSize + 0) * 2 + 0] = nextTokenId
    layout.model.sortedBuf[(position * model.config.vocabSize + 0) * 2 + 1] = 1
  }

  const finalPosition = Math.max(0, layout.model.inputLen - 1)
  sorted.forEach(({ tokenId, prob }, rank) => {
    const baseIndex = (finalPosition * model.config.vocabSize + rank) * 2
    layout.model.sortedBuf[baseIndex + 0] = tokenId
    layout.model.sortedBuf[baseIndex + 1] = prob
  })
}

function createDynamicTextures(
  gl: WebGL2RenderingContext,
  model: MicroVizStaticModel,
): MicroVizTextureSet {
  const T = model.config.blockSize
  const C = model.config.nEmbd
  const A = model.config.headDim
  const V = model.config.vocabSize

  const textures: MicroVizTextureSet = {
    staticTextures: {},
    dynamicTextures: {
      context: createBufferTex(gl, T, 1, 1),
      'residual-grid': createBufferTex(gl, T, C, 1),
      'norm1-grid': createBufferTex(gl, T, C, 1),
      'norm1-agg-ms': createBufferTex(gl, T, 1, 1),
      'norm1-agg-rms': createBufferTex(gl, T, 1, 1),
      'attn-out-grid': createBufferTex(gl, T, C, 1),
      'attn-residual-grid': createBufferTex(gl, T, C, 1),
      'norm2-grid': createBufferTex(gl, T, C, 1),
      'norm2-agg-ms': createBufferTex(gl, T, 1, 1),
      'norm2-agg-rms': createBufferTex(gl, T, 1, 1),
      'mlp-fc-grid': createBufferTex(gl, C * 4, T, 1),
      'mlp-act-grid': createBufferTex(gl, C * 4, T, 1),
      'mlp-result-grid': createBufferTex(gl, T, C, 1),
      'mlp-residual-grid': createBufferTex(gl, T, C, 1),
      'logits-grid': createBufferTex(gl, T, V, 1),
      'softmax-max': createBufferTex(gl, T, 1, 1),
      'softmax-exp': createBufferTex(gl, T, 1, 1),
      'probs-grid': createBufferTex(gl, T, V, 1),
      'sample-grid': createBufferTex(gl, T, 1, 1),
      ...Object.fromEntries(
        headBlockIds.flatMap((blockId) => [
          [`${blockId}-q`, createBufferTex(gl, T, A, 1)],
          [`${blockId}-k`, createBufferTex(gl, T, A, 1)],
          [`${blockId}-v`, createBufferTex(gl, T, A, 1)],
          [`${blockId}-scores`, createBufferTex(gl, T, T, 1)],
          [`${blockId}-weights`, createBufferTex(gl, T, T, 1)],
          [`${blockId}-vout`, createBufferTex(gl, T, A, 1)],
          [`${blockId}-agg-max`, createBufferTex(gl, 1, T, 1)],
          [`${blockId}-agg-exp`, createBufferTex(gl, 1, T, 1)],
        ]),
      ),
    },
    scales: {},
  }

  writeMatrixTexture(gl, textures, 'wte', model.weights.wte)
  writeMatrixTexture(gl, textures, 'wpe', model.weights.wpe)
  writeMatrixTexture(gl, textures, 'layer0.attn_wq', model.weights['layer0.attn_wq'])
  writeMatrixTexture(gl, textures, 'layer0.attn_wk', model.weights['layer0.attn_wk'])
  writeMatrixTexture(gl, textures, 'layer0.attn_wv', model.weights['layer0.attn_wv'])
  writeMatrixTexture(gl, textures, 'layer0.attn_wo', model.weights['layer0.attn_wo'])
  writeMatrixTexture(gl, textures, 'layer0.mlp_fc1', model.weights['layer0.mlp_fc1'])
  writeMatrixTexture(gl, textures, 'layer0.mlp_fc2', model.weights['layer0.mlp_fc2'])
  writeMatrixTexture(gl, textures, 'lm_head', model.weights.lm_head)

  return textures
}

function mapNodeToBlocks(nodeId: VizNodeId): MicroVizBlockId[] {
  switch (nodeId) {
    case 'qkv':
      return ['q-project', 'k-project', 'v-project']
    case 'attention-mix':
      return [
        'attention-head-1',
        'attention-head-2',
        'attention-head-3',
        'attention-head-4',
        'attention-out',
      ]
    case 'mlp':
      return ['mlp-fc1', 'mlp-relu', 'mlp-fc2']
    default:
      return [nodeId as MicroVizBlockId]
  }
}

function mapEdgeToMicro(edgeId: VizEdgeId): MicroVizEdgeId[] {
  switch (edgeId) {
    case 'norm-1-to-qkv':
      return ['norm-1-to-q-project', 'norm-1-to-k-project', 'norm-1-to-v-project']
    case 'qkv-to-attention-head-1':
      return [
        'q-project-to-attention-head-1',
        'k-project-to-attention-head-1',
        'v-project-to-attention-head-1',
      ]
    case 'qkv-to-attention-head-2':
      return [
        'q-project-to-attention-head-2',
        'k-project-to-attention-head-2',
        'v-project-to-attention-head-2',
      ]
    case 'qkv-to-attention-head-3':
      return [
        'q-project-to-attention-head-3',
        'k-project-to-attention-head-3',
        'v-project-to-attention-head-3',
      ]
    case 'qkv-to-attention-head-4':
      return [
        'q-project-to-attention-head-4',
        'k-project-to-attention-head-4',
        'v-project-to-attention-head-4',
      ]
    case 'attention-head-1-to-attention-mix':
      return ['attention-head-1-to-attention-out']
    case 'attention-head-2-to-attention-mix':
      return ['attention-head-2-to-attention-out']
    case 'attention-head-3-to-attention-mix':
      return ['attention-head-3-to-attention-out']
    case 'attention-head-4-to-attention-mix':
      return ['attention-head-4-to-attention-out']
    case 'attention-mix-to-residual-add-1':
      return ['attention-out-to-residual-add-1']
    case 'norm-2-to-mlp':
      return ['norm-2-to-mlp-fc1', 'mlp-fc1-to-mlp-relu', 'mlp-relu-to-mlp-fc2']
    default:
      return [edgeId as MicroVizEdgeId]
  }
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

function makeBinding(kind: MicroVizTextureBinding['kind'], key: string) {
  return { kind, key } satisfies MicroVizTextureBinding
}

function cameraAnchorBlockIdsForPhase(phase: PhaseDefinition) {
  switch (phase.id) {
    case 'tokenize':
      return null
    case 'token-embedding':
    case 'position-embedding':
    case 'embed-add-norm':
      return [
        'context',
        'token-embedding',
        'position-embedding',
        'residual-stream',
        'norm-1',
      ] satisfies MicroVizBlockId[]
    case 'qkv':
    case 'attention-scores':
    case 'attention-softmax':
    case 'weighted-values':
      return [
        'q-project',
        'k-project',
        'v-project',
        'attention-head-1',
        'attention-head-2',
        'attention-head-3',
        'attention-head-4',
        'attention-out',
      ] satisfies MicroVizBlockId[]
    case 'attn-out':
      return ['attention-out', 'residual-add-1', 'norm-2'] satisfies MicroVizBlockId[]
    case 'mlp':
      return [
        'norm-2',
        'mlp-fc1',
        'mlp-relu',
        'mlp-fc2',
      ] satisfies MicroVizBlockId[]
    case 'lm-head':
      return [
        'lm-head-weight',
        'logits',
        'softmax-max',
        'softmax-exp',
      ] satisfies MicroVizBlockId[]
    case 'probabilities':
      return [
        'logits',
        'softmax-max',
        'softmax-exp',
        'probabilities',
      ] satisfies MicroVizBlockId[]
    case 'sample':
    case 'append-or-stop':
      return [
        'logits',
        'softmax-max',
        'softmax-exp',
        'probabilities',
        'sample',
      ] satisfies MicroVizBlockId[]
    default:
      return null
  }
}

function phaseCameraCenterRatio(phase: PhaseDefinition) {
  if (phase.viz.cameraPoseId === 'overview') {
    return 0.5
  }

  if (
    phase.id === 'token-embedding' ||
    phase.id === 'position-embedding' ||
    phase.id === 'embed-add-norm'
  ) {
    return 0.52
  }

  if (phase.id === 'mlp') {
    return 0.72
  }

  if (phase.id === 'lm-head') {
    return 0.88
  }

  if (phase.id === 'probabilities') {
    return 0.93
  }

  if (phase.id === 'sample' || phase.id === 'append-or-stop') {
    return 0.97
  }

  switch (phase.viz.cameraPoseId) {
    case 'readout':
    case 'sample':
      return 0.82
    default:
      return 0.35
  }
}

function buildPhaseCameraTarget(
  phase: PhaseDefinition,
  layout: MicroVizLayout,
  focusBlockIds: MicroVizBlockId[],
) {
  if (phase.viz.cameraPoseId === 'overview') {
    return {
      center: layout.cameraPoses.overview.center.clone(),
      angle: layout.cameraPoses.overview.angle.clone(),
    }
  }

  const anchorBlockIds = cameraAnchorBlockIdsForPhase(phase)
  const anchorCubes = anchorBlockIds?.flatMap((blockId) => {
    const block = layout.blockMap[blockId]
    return block ? [block.cube] : []
  })
  const sourceCubes =
    anchorCubes && anchorCubes.length > 0
      ? anchorCubes
      : layout.cubes.filter((cube) => {
          const focusId = layout.cubeFocusIds[cube.idx]
          if (focusId == null) {
            return false
          }

          return focusBlockIds.some(
            (blockId) => layout.blockMap[blockId].codeFocusId === focusId,
          )
        })
  const cameraCubes = sourceCubes.length > 0 ? sourceCubes : layout.cubes
  const bounds = cameraCubes.reduce(
    (acc, cube) => {
      acc.minX = Math.min(acc.minX, cube.x)
      acc.maxX = Math.max(acc.maxX, cube.x + cube.dx)
      acc.minY = Math.min(acc.minY, cube.y)
      acc.maxY = Math.max(acc.maxY, cube.y + cube.dy)
      acc.minZ = Math.min(acc.minZ, cube.z)
      acc.maxZ = Math.max(acc.maxZ, cube.z + cube.dz)
      return acc
    },
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    },
  )
  const centerX = (bounds.minX + bounds.maxX) * 0.5
  const centerY =
    bounds.minY + (bounds.maxY - bounds.minY) * phaseCameraCenterRatio(phase)
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5
  const spanX = Math.max(1, bounds.maxX - bounds.minX)
  const spanY = Math.max(1, bounds.maxY - bounds.minY)
  const baseAngles = {
    overview: { x: 288, y: 17, z: 8.8 },
    input: { x: 288, y: 17, z: 2.0 },
    attention: { x: 287, y: 18, z: 5.6 },
    residual: { x: 288, y: 17, z: 6.1 },
    readout: { x: 271.3, y: 6.4, z: 9.8 },
    sample: { x: 271.3, y: 6.4, z: 10.4 },
  } as const
  const base = baseAngles[phase.viz.cameraPoseId]
  const zoomAdjust = Math.min(1.2, Math.max(-1.1, (Math.max(spanX, spanY) - 150) / 180))
  const xBias =
    phase.viz.cameraPoseId === 'input'
      ? -18
      : phase.viz.cameraPoseId === 'readout' || phase.viz.cameraPoseId === 'sample'
          ? 0
          : -6
  const yBias =
    phase.viz.cameraPoseId === 'readout' || phase.viz.cameraPoseId === 'sample'
      ? 0
      : phase.viz.cameraPoseId === 'input'
        ? 132
        : phase.viz.cameraPoseId === 'attention'
          ? -52
          : 0
  const minZoom = phase.viz.cameraPoseId === 'input' ? 3.0 : 4.8

  return {
    center: new Vec3(centerX + xBias, centerY + yBias, centerZ),
    angle: new Vec3(base.x, base.y, Math.max(minZoom, base.z + zoomAdjust)),
  }
}

function phaseSceneOffset(cameraPoseId: PhaseDefinition['viz']['cameraPoseId']) {
  switch (cameraPoseId) {
    case 'overview':
      return new Vec3(26, -520, 0)
    case 'input':
      return new Vec3(18, -190, 0)
    case 'attention':
      return new Vec3(12, -400, 0)
    case 'residual':
      return new Vec3(8, -350, 0)
    case 'readout':
      return new Vec3(0, -620, 0)
    case 'sample':
      return new Vec3(0, -650, 0)
  }
}

function phaseCardOffset(
  cameraPoseId: PhaseDefinition['viz']['cameraPoseId'],
  sceneOffset: Vec3,
) {
  const cardLift =
    cameraPoseId === 'overview'
      ? new Vec3(18, -28, 0)
      : cameraPoseId === 'input' || cameraPoseId === 'attention'
        ? new Vec3(18, 56, 0)
        : new Vec3(18, -40, 0)
  return sceneOffset.add(cardLift)
}

export function buildMicroVizPhaseState(
  phase: PhaseDefinition,
  frame: VizFrame,
  layout: MicroVizLayout,
): MicroVizPhaseState {
  const focusBlockIds = unique(mapNodeToBlocks(frame.focusNodeId))
  const emphasisBlockIds = unique(
    frame.emphasisNodeIds.flatMap((nodeId) => mapNodeToBlocks(nodeId)),
  )
  if (phase.id === 'lm-head') {
    emphasisBlockIds.push('lm-head-weight', 'softmax-max', 'softmax-exp')
  }
  if (phase.id === 'probabilities') {
    emphasisBlockIds.push('softmax-max', 'softmax-exp')
  }
  if (phase.id === 'sample' || phase.id === 'append-or-stop') {
    emphasisBlockIds.push('softmax-max', 'softmax-exp', 'sample')
  }
  const emphasisEdgeIds = unique(
    frame.emphasisEdgeIds.flatMap((edgeId) => mapEdgeToMicro(edgeId)),
  )

  const sceneOffset = phaseSceneOffset(phase.viz.cameraPoseId)
  const cardOffset = phaseCardOffset(phase.viz.cameraPoseId, sceneOffset)
  const opacityByBlockId: MicroVizPhaseState['opacityByBlockId'] = {}
  const highlightByBlockId: MicroVizPhaseState['highlightByBlockId'] = {}
  const hoverBlockIndices = unique(
    [...focusBlockIds, ...emphasisBlockIds].map((blockId) => layout.blockMap[blockId].cube.idx),
  )

  for (const blockId of Object.keys(layout.blockMap) as MicroVizBlockId[]) {
    const isFocused = focusBlockIds.includes(blockId)
    const isEmphasized = emphasisBlockIds.includes(blockId)
    opacityByBlockId[blockId] = isFocused ? 1 : isEmphasized ? 0.96 : 0.86
    highlightByBlockId[blockId] = isFocused ? 0.9 : isEmphasized ? 0.45 : 0.08
  }

  const dimHover =
    phase.id === 'tokenize' ||
    phase.id === 'embed-add-norm' ||
    phase.id === 'attn-out'
      ? DimStyle.T
      : phase.id === 'token-embedding' ||
          phase.id === 'position-embedding' ||
          phase.id === 'qkv' ||
          phase.id === 'mlp' ||
          phase.id === 'lm-head'
        ? DimStyle.C
        : null
  const cameraTarget = buildPhaseCameraTarget(
    phase,
    layout,
    focusBlockIds,
  )

  const blockBindings: Partial<Record<MicroVizBlockId, MicroVizTextureBinding>> = {
    context: makeBinding('dynamic', 'context'),
    'token-embedding': makeBinding('static', 'wte'),
    'position-embedding': makeBinding('static', 'wpe'),
    'residual-stream': makeBinding('dynamic', 'residual-grid'),
    'norm-1': makeBinding('dynamic', 'norm1-grid'),
    'q-project': makeBinding('static', 'layer0.attn_wq'),
    'k-project': makeBinding('static', 'layer0.attn_wk'),
    'v-project': makeBinding('static', 'layer0.attn_wv'),
    'attention-out': makeBinding('dynamic', 'attn-out-grid'),
    'residual-add-1': makeBinding('dynamic', 'attn-residual-grid'),
    'norm-2': makeBinding('dynamic', 'norm2-grid'),
    'mlp-fc1': makeBinding('static', 'layer0.mlp_fc1'),
    'mlp-relu': makeBinding('dynamic', 'mlp-act-grid'),
    'mlp-fc2': makeBinding('static', 'layer0.mlp_fc2'),
    'lm-head-weight': makeBinding('static', 'lm_head'),
    logits: makeBinding('dynamic', 'logits-grid'),
    'softmax-max': makeBinding('dynamic', 'softmax-max'),
    'softmax-exp': makeBinding('dynamic', 'softmax-exp'),
    probabilities: makeBinding('dynamic', 'probs-grid'),
    sample: makeBinding('dynamic', 'sample-grid'),
  }

  for (let headIndex = 0; headIndex < layout.shape.nHeads; headIndex += 1) {
    const blockId = headBlockIds[headIndex]!
    blockBindings[blockId] = makeBinding(
      'dynamic',
      phase.id === 'qkv'
        ? `${blockId}-q`
        : phase.id === 'attention-scores'
        ? `${blockId}-scores`
        : phase.id === 'attention-softmax'
          ? `${blockId}-weights`
        : phase.id === 'weighted-values'
          ? `${blockId}-vout`
          : `${blockId}-weights`,
    )
  }

  return {
    phaseId: phase.id,
    cameraPoseId: frame.cameraPoseId,
    cameraTarget,
    sceneOffset,
    cardOffset,
    focusBlockIds,
    emphasisBlockIds: unique([...focusBlockIds, ...emphasisBlockIds]),
    emphasisEdgeIds,
    hoverBlockIndices,
    dimHover,
    lines: [],
    topOutputOpacity:
      phase.id === 'lm-head' ||
      phase.id === 'probabilities' ||
      phase.id === 'sample' ||
      phase.id === 'append-or-stop'
        ? 1
        : 0.9,
    opacityByBlockId,
    highlightByBlockId,
    blockBindings,
    specials: {},
  }
}

export function createMicroVizTextures(
  gl: WebGL2RenderingContext,
  model: MicroVizStaticModel,
) {
  return createDynamicTextures(gl, model)
}

function writeDynamicTexture(
  gl: WebGL2RenderingContext,
  textures: MicroVizTextureSet,
  key: string,
  values: ArrayLike<number>,
  width: number,
  height: number,
  options: {
    sequential?: boolean
    sampledIndex?: number
  } = {},
) {
  const texture = textures.dynamicTextures[key]
  if (!texture) {
    return
  }

  const buffer = new Float32Array(width * height)
  buffer.set(Array.from(values).slice(0, width * height))

  if (options.sampledIndex != null && options.sampledIndex < buffer.length) {
    buffer.fill(0)
    buffer[options.sampledIndex] = 1
  }

  writeToBufferTex(gl, texture, buffer)
  textures.scales[key] = options.sequential
    ? 1 / maxValue(buffer)
    : 1 / maxAbs(buffer)
}

function bindCubeTexture(
  ctx: MicroVizRenderContext,
  cube: { access?: { disable?: boolean; src: unknown; scale: number } },
  kind: 'static' | 'dynamic',
  key: string,
) {
  const access = cube.access
  if (!access) {
    return
  }
  access.disable = false
  access.src =
    kind === 'static'
      ? ctx.textures.staticTextures[key]
      : ctx.textures.dynamicTextures[key]
  access.scale = ctx.textures.scales[key] ?? 1
}

function buildContextAndNormGrids(
  model: MicroVizStaticModel,
  contextTokens: string[],
) {
  const T = model.config.blockSize
  const C = model.config.nEmbd
  const tokenBuffer = makeZeroGrid(T, 1)
  const residualGrid = makeZeroGrid(T, C)
  const normGrid = makeZeroGrid(T, C)
  const normMeanSquare = makeZeroGrid(T, 1)
  const normRms = makeZeroGrid(T, 1)

  for (let position = 0; position < T; position += 1) {
    const token = contextTokens[position]
    const tokenId = token ? tokenToId(token, model) : model.config.bosToken
    tokenBuffer[position] = tokenId / Math.max(1, model.config.vocabSize - 1)
    const tokenEmbedding = getRow(model.weights.wte, tokenId)
    const positionEmbedding = getRow(model.weights.wpe, position)
    const residual = Array.from(tokenEmbedding, (value, index) => (
      value + (positionEmbedding[index] ?? 0)
    ))
    const activeResidual = token ? residual : new Array(C).fill(0)
    normMeanSquare[position] = meanSquare(activeResidual)
    normRms[position] = rmsValue(activeResidual)
    setColumn(residualGrid, T, activeResidual, position)
    setColumn(normGrid, T, rmsnorm(activeResidual), position)
  }

  return { tokenBuffer, residualGrid, normGrid, normMeanSquare, normRms }
}

function buildHeadTextures(
  model: MicroVizStaticModel,
  trace: TokenStepTrace,
  headIndex: number,
) {
  const T = model.config.blockSize
  const A = model.config.headDim
  const head = trace.heads[headIndex]!
  const qGrid = makeZeroGrid(T, A)
  const kGrid = makeZeroGrid(T, A)
  const vGrid = makeZeroGrid(T, A)
  const scoreGrid = makeZeroGrid(T, T)
  const weightGrid = makeZeroGrid(T, T)
  const vOutGrid = makeZeroGrid(T, A)
  const aggMax = makeZeroGrid(1, T)
  const aggExp = makeZeroGrid(1, T)
  const visibleCount = head.kSlices.length
  const currentPosition = Math.min(trace.positionId, T - 1)

  setColumn(qGrid, T, head.q, currentPosition)
  head.kSlices.forEach((slice, index) => setColumn(kGrid, T, slice, index))
  head.vSlices.forEach((slice, index) => setColumn(vGrid, T, slice, index))
  setColumn(vOutGrid, T, head.mixedValue, currentPosition)
  head.scores.forEach((score, index) => {
    scoreGrid[currentPosition * T + index] = score
  })
  head.weights.forEach((weight, index) => {
    weightGrid[currentPosition * T + index] = weight
  })
  aggMax[currentPosition] = Math.max(...head.scores.slice(0, visibleCount))
  aggExp[currentPosition] = head.scores
    .slice(0, visibleCount)
    .reduce((sum, score) => sum + Math.exp(score - aggMax[currentPosition]!), 0)

  return {
    qGrid,
    kGrid,
    vGrid,
    scoreGrid,
    weightGrid,
    vOutGrid,
    aggMax,
    aggExp,
  }
}

function buildCurrentPositionRowGrid(
  width: number,
  height: number,
  rowIndex: number,
  values: ArrayLike<number>,
) {
  const grid = makeZeroGrid(width, height)
  setRow(grid, width, Array.from(values), rowIndex)
  return grid
}

function buildCurrentPositionColumnGrid(
  width: number,
  height: number,
  columnIndex: number,
  values: ArrayLike<number>,
) {
  const grid = makeZeroGrid(width, height)
  setColumn(grid, width, values, columnIndex)
  return grid
}

function buildAggregateLine(
  width: number,
  index: number,
  value: number,
) {
  const grid = makeZeroGrid(width, 1)
  if (index >= 0 && index < width) {
    grid[index] = value
  }
  return grid
}

export function uploadMicroVizFrame(
  ctx: MicroVizRenderContext,
  model: MicroVizStaticModel,
  phaseState: MicroVizPhaseState,
  trace: TokenStepTrace,
  contextTokens: string[],
) {
  const { gl } = ctx.renderState
  const T = model.config.blockSize
  const C = model.config.nEmbd
  const V = model.config.vocabSize
  const currentPosition = Math.min(trace.positionId, T - 1)

  buildCardModel(ctx.layout, model, trace, contextTokens)

  const { tokenBuffer, residualGrid, normGrid, normMeanSquare, normRms } = buildContextAndNormGrids(
    model,
    contextTokens,
  )
  writeDynamicTexture(gl, ctx.textures, 'context', tokenBuffer, T, 1, { sequential: true })
  writeDynamicTexture(gl, ctx.textures, 'residual-grid', residualGrid, T, C)
  writeDynamicTexture(gl, ctx.textures, 'norm1-grid', normGrid, T, C)
  writeDynamicTexture(gl, ctx.textures, 'norm1-agg-ms', normMeanSquare, T, 1)
  writeDynamicTexture(gl, ctx.textures, 'norm1-agg-rms', normRms, T, 1, {
    sequential: true,
  })
  const attnResidualNormMeanSquare = meanSquare(trace.xAfterAttnResidual)
  const attnResidualNormRms = rmsValue(trace.xAfterAttnResidual)
  writeDynamicTexture(
    gl,
    ctx.textures,
    'attn-out-grid',
    buildCurrentPositionColumnGrid(T, C, currentPosition, trace.attnOutput),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'attn-residual-grid',
    buildCurrentPositionColumnGrid(T, C, currentPosition, trace.xAfterAttnResidual),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'norm2-grid',
    buildCurrentPositionColumnGrid(T, C, currentPosition, rmsnorm(trace.xAfterAttnResidual)),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'norm2-agg-ms',
    buildAggregateLine(T, currentPosition, attnResidualNormMeanSquare),
    T,
    1,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'norm2-agg-rms',
    buildAggregateLine(T, currentPosition, attnResidualNormRms),
    T,
    1,
    { sequential: true },
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'mlp-fc-grid',
    buildCurrentPositionRowGrid(C * 4, T, currentPosition, trace.mlpHidden),
    C * 4,
    T,
    { sequential: true },
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'mlp-act-grid',
    buildCurrentPositionRowGrid(
      C * 4,
      T,
      currentPosition,
      trace.mlpHidden.map((value) => Math.max(0, value)),
    ),
    C * 4,
    T,
    { sequential: true },
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'mlp-result-grid',
    buildCurrentPositionColumnGrid(T, C, currentPosition, trace.mlpOutput),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'mlp-residual-grid',
    buildCurrentPositionColumnGrid(T, C, currentPosition, trace.xAfterMlpResidual),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'logits-grid',
    buildCurrentPositionColumnGrid(T, V, currentPosition, trace.logits),
    T,
    V,
  )
  const maxLogit = Math.max(...trace.logits)
  const expSum = trace.logits.reduce(
    (sum, value) => sum + Math.exp(value - maxLogit),
    0,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'softmax-max',
    buildAggregateLine(T, currentPosition, maxLogit),
    T,
    1,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'softmax-exp',
    buildAggregateLine(T, currentPosition, expSum),
    T,
    1,
    { sequential: true },
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'probs-grid',
    buildCurrentPositionColumnGrid(T, V, currentPosition, trace.probs),
    T,
    V,
    { sequential: true },
  )
  const sampleGrid = makeZeroGrid(T, 1)
  sampleGrid[currentPosition] = trace.sampledTokenId === model.config.bosToken ? 0.5 : 1
  writeDynamicTexture(gl, ctx.textures, 'sample-grid', sampleGrid, T, 1, {
    sequential: true,
  })

  for (let headIndex = 0; headIndex < model.config.nHead; headIndex += 1) {
    const blockId = headBlockIds[headIndex]!
    const headTextures = buildHeadTextures(model, trace, headIndex)
    writeDynamicTexture(gl, ctx.textures, `${blockId}-q`, headTextures.qGrid, T, model.config.headDim)
    writeDynamicTexture(gl, ctx.textures, `${blockId}-k`, headTextures.kGrid, T, model.config.headDim)
    writeDynamicTexture(gl, ctx.textures, `${blockId}-v`, headTextures.vGrid, T, model.config.headDim)
    writeDynamicTexture(gl, ctx.textures, `${blockId}-scores`, headTextures.scoreGrid, T, T)
    writeDynamicTexture(gl, ctx.textures, `${blockId}-weights`, headTextures.weightGrid, T, T, {
      sequential: true,
    })
    writeDynamicTexture(gl, ctx.textures, `${blockId}-vout`, headTextures.vOutGrid, T, model.config.headDim)
    writeDynamicTexture(gl, ctx.textures, `${blockId}-agg-max`, headTextures.aggMax, 1, T)
    writeDynamicTexture(gl, ctx.textures, `${blockId}-agg-exp`, headTextures.aggExp, 1, T, {
      sequential: true,
    })
  }

  bindCubeTexture(ctx, ctx.layout.idxObj, 'dynamic', 'context')
  bindCubeTexture(ctx, ctx.layout.tokEmbedObj, 'static', 'wte')
  bindCubeTexture(ctx, ctx.layout.posEmbedObj, 'static', 'wpe')
  bindCubeTexture(ctx, ctx.layout.residual0, 'dynamic', 'residual-grid')

  const block = ctx.layout.transformerBlocks[0]
  bindCubeTexture(ctx, block.ln1.lnAgg1, 'dynamic', 'norm1-agg-ms')
  bindCubeTexture(ctx, block.ln1.lnAgg2, 'dynamic', 'norm1-agg-rms')
  bindCubeTexture(ctx, block.ln1.lnResid, 'dynamic', 'norm1-grid')
  bindCubeTexture(ctx, block.projWeight, 'static', 'layer0.attn_wo')
  bindCubeTexture(ctx, block.attnOut, 'dynamic', 'attn-out-grid')
  bindCubeTexture(ctx, block.attnResidual, 'dynamic', 'attn-residual-grid')
  bindCubeTexture(ctx, block.ln2.lnAgg1, 'dynamic', 'norm2-agg-ms')
  bindCubeTexture(ctx, block.ln2.lnAgg2, 'dynamic', 'norm2-agg-rms')
  bindCubeTexture(ctx, block.ln2.lnResid, 'dynamic', 'norm2-grid')
  bindCubeTexture(ctx, block.mlpFcWeight, 'static', 'layer0.mlp_fc1')
  bindCubeTexture(ctx, block.mlpFc, 'dynamic', 'mlp-fc-grid')
  bindCubeTexture(ctx, block.mlpAct, 'dynamic', 'mlp-act-grid')
  bindCubeTexture(ctx, block.mlpProjWeight, 'static', 'layer0.mlp_fc2')
  bindCubeTexture(ctx, block.mlpResult, 'dynamic', 'mlp-result-grid')
  bindCubeTexture(ctx, block.mlpResidual, 'dynamic', 'mlp-residual-grid')

  block.heads.forEach((head, headIndex) => {
    const blockId = headBlockIds[headIndex]!
    bindCubeTexture(ctx, head.qWeightBlock, 'static', 'layer0.attn_wq')
    bindCubeTexture(ctx, head.kWeightBlock, 'static', 'layer0.attn_wk')
    bindCubeTexture(ctx, head.vWeightBlock, 'static', 'layer0.attn_wv')
    bindCubeTexture(ctx, head.qBlock, 'dynamic', `${blockId}-q`)
    bindCubeTexture(ctx, head.kBlock, 'dynamic', `${blockId}-k`)
    bindCubeTexture(ctx, head.vBlock, 'dynamic', `${blockId}-v`)
    bindCubeTexture(ctx, head.attnMtx, 'dynamic', `${blockId}-scores`)
    bindCubeTexture(ctx, head.attnMtxAgg1, 'dynamic', `${blockId}-agg-exp`)
    bindCubeTexture(ctx, head.attnMtxAgg2, 'dynamic', `${blockId}-agg-max`)
    bindCubeTexture(ctx, head.attnMtxSm, 'dynamic', `${blockId}-weights`)
    bindCubeTexture(ctx, head.vOutBlock, 'dynamic', `${blockId}-vout`)
  })

  bindCubeTexture(ctx, ctx.layout.lmHeadWeight, 'static', 'lm_head')
  bindCubeTexture(ctx, ctx.layout.logits, 'dynamic', 'logits-grid')
  bindCubeTexture(ctx, ctx.layout.logitsAgg1, 'dynamic', 'softmax-exp')
  bindCubeTexture(ctx, ctx.layout.logitsAgg2, 'dynamic', 'softmax-max')
  bindCubeTexture(ctx, ctx.layout.logitsSoftmax, 'dynamic', 'probs-grid')

  for (const [blockId, block] of Object.entries(ctx.layout.blockMap) as Array<
    [MicroVizBlockId, MicroVizLayout['blockMap'][MicroVizBlockId]]
  >) {
    const binding = phaseState.blockBindings[blockId]
    if (!binding) {
      continue
    }
    bindCubeTexture(ctx, block.cube, binding.kind, binding.key)
  }
}

export function applyMicroVizPhase(
  ctx: MicroVizRenderContext,
  phaseState: MicroVizPhaseState,
) {
  for (let index = 0; index < ctx.layout.cubes.length; index += 1) {
    const cube = ctx.layout.cubes[index]!
    const base = ctx.layout.baseCubePositions[index]!
    cube.x = base.x + ctx.currentSceneOffset.x
    cube.y = base.y + ctx.currentSceneOffset.y
    cube.z = base.z + ctx.currentSceneOffset.z
  }

  const focusIds = new Set(
    phaseState.focusBlockIds.map((blockId) => ctx.layout.blockMap[blockId].codeFocusId),
  )
  const emphasisIds = new Set(
    phaseState.emphasisBlockIds.map((blockId) => ctx.layout.blockMap[blockId].codeFocusId),
  )

  for (const cube of ctx.layout.cubes) {
    const focusId = ctx.layout.cubeFocusIds[cube.idx]
    const namedBlock = (Object.values(ctx.layout.blockMap).find((entry) => entry.cube.idx === cube.idx))
    const blockId = namedBlock?.id
    const baseOpacity = blockId ? phaseState.opacityByBlockId[blockId] : cube.name ? 0.84 : 0
    const baseHighlight = blockId ? phaseState.highlightByBlockId[blockId] : cube.name ? 0.08 : 0
    if (focusId != null && focusIds.has(focusId)) {
      cube.opacity = 1
      cube.highlight = 1
      continue
    }
    if (focusId != null && emphasisIds.has(focusId)) {
      cube.opacity = Math.max(baseOpacity ?? 0, 0.94)
      cube.highlight = Math.max(baseHighlight ?? 0, 0.4)
      continue
    }
    cube.opacity = baseOpacity ?? (cube.name ? 0.82 : 0)
    cube.highlight = baseHighlight ?? (cube.name ? 0.12 : 0)
  }

  ctx.layout.embedLabel.visible =
    phaseState.phaseId.startsWith('token') ||
    phaseState.phaseId.startsWith('position') ||
    phaseState.phaseId === 'tokenize'
      ? 1
      : 0.88
  for (const transformerBlock of ctx.layout.transformerBlocks) {
    transformerBlock.transformerLabel.visible = 0.92
    transformerBlock.selfAttendLabel.visible =
      phaseState.phaseId === 'qkv' ||
      phaseState.phaseId === 'attention-scores' ||
      phaseState.phaseId === 'attention-softmax' ||
      phaseState.phaseId === 'weighted-values' ||
      phaseState.phaseId === 'attn-out'
        ? 1
        : 0.72
    transformerBlock.projLabel.visible =
      phaseState.phaseId === 'attn-out' ? 1 : 0.62
    transformerBlock.mlpLabel.visible =
      phaseState.phaseId === 'mlp' ? 1 : 0.72
    transformerBlock.heads.forEach((head, headIndex) => {
      const isActive = phaseState.focusBlockIds.includes(headBlockIds[headIndex]!)
      head.headLabel.visible = isActive ? 1 : 0.62
      head.qLabel.visible = phaseState.phaseId === 'qkv' ? 1 : 0.7
      head.kLabel.visible = phaseState.phaseId === 'qkv' ? 1 : 0.7
      head.vLabel.visible = phaseState.phaseId === 'qkv' ? 1 : 0.7
      head.biasLabel.visible = 0
      head.mtxLabel.visible =
        phaseState.phaseId === 'attention-scores' ||
        phaseState.phaseId === 'attention-softmax'
          ? 1
          : 0.6
      head.vectorLabel.visible = phaseState.phaseId === 'weighted-values' ? 1 : 0.6
    })
  }
  ctx.layout.outputLabel.visible =
    phaseState.phaseId === 'lm-head' ||
    phaseState.phaseId === 'probabilities' ||
    phaseState.phaseId === 'sample' ||
    phaseState.phaseId === 'append-or-stop'
      ? 1
      : 0.84
}

export function resetMicroVizHoverState(ctx: MicroVizRenderContext) {
  for (const cube of ctx.layout.cubes) {
    cube.subs = undefined
    cube.rangeOffsetsX = undefined
    cube.rangeOffsetsY = undefined
    cube.rangeOffsetsZ = undefined
  }
}
