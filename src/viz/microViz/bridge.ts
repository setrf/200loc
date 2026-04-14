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
import { Vec3, Vec4 } from '../../vendor/llmVizOriginal/utils/vector'
import { addLine } from '../../vendor/llmVizOriginal/llm/render/lineRender'
import { RenderPhase } from '../../vendor/llmVizOriginal/llm/render/sharedRender'

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
      'attn-out-grid': createBufferTex(gl, T, C, 1),
      'attn-residual-grid': createBufferTex(gl, T, C, 1),
      'norm2-grid': createBufferTex(gl, T, C, 1),
      'mlp-fc-grid': createBufferTex(gl, C * 4, T, 1),
      'mlp-act-grid': createBufferTex(gl, C * 4, T, 1),
      'mlp-result-grid': createBufferTex(gl, T, C, 1),
      'mlp-residual-grid': createBufferTex(gl, T, C, 1),
      'logits-grid': createBufferTex(gl, T, V, 1),
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

export function buildMicroVizPhaseState(
  phase: PhaseDefinition,
  frame: VizFrame,
  layout: MicroVizLayout,
): MicroVizPhaseState {
  const focusBlockIds = unique(mapNodeToBlocks(frame.focusNodeId))
  const emphasisBlockIds = unique(
    frame.emphasisNodeIds.flatMap((nodeId) => mapNodeToBlocks(nodeId)),
  )
  const emphasisEdgeIds = unique(
    frame.emphasisEdgeIds.flatMap((edgeId) => mapEdgeToMicro(edgeId)),
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
    logits: makeBinding('dynamic', 'logits-grid'),
    probabilities: makeBinding('dynamic', 'probs-grid'),
    sample: makeBinding('dynamic', 'sample-grid'),
  }

  for (let headIndex = 0; headIndex < layout.shape.nHeads; headIndex += 1) {
    const blockId = headBlockIds[headIndex]!
    blockBindings[blockId] = makeBinding(
      'dynamic',
      phase.id === 'attention-scores'
        ? `${blockId}-scores`
        : phase.id === 'weighted-values'
          ? `${blockId}-vout`
          : `${blockId}-weights`,
    )
  }

  return {
    phaseId: phase.id,
    cameraPoseId: frame.cameraPoseId,
    focusBlockIds,
    emphasisBlockIds: unique([...focusBlockIds, ...emphasisBlockIds]),
    emphasisEdgeIds,
    dimmedBlockIds: [],
    blockBindings,
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

  contextTokens.slice(0, T).forEach((token, position) => {
    const tokenId = tokenToId(token, model)
    tokenBuffer[position] = tokenId / Math.max(1, model.config.vocabSize - 1)
    const tokenEmbedding = getRow(model.weights.wte, tokenId)
    const positionEmbedding = getRow(model.weights.wpe, position)
    const residual = Array.from(tokenEmbedding, (value, index) => (
      value + (positionEmbedding[index] ?? 0)
    ))
    setColumn(residualGrid, T, residual, position)
    setColumn(normGrid, T, rmsnorm(residual), position)
  })

  return { tokenBuffer, residualGrid, normGrid }
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

function buildCurrentPositionGrid(
  width: number,
  height: number,
  rowIndex: number,
  values: ArrayLike<number>,
) {
  const grid = makeZeroGrid(width, height)
  setRow(grid, width, Array.from(values), rowIndex)
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

  const { tokenBuffer, residualGrid, normGrid } = buildContextAndNormGrids(
    model,
    contextTokens,
  )
  writeDynamicTexture(gl, ctx.textures, 'context', tokenBuffer, T, 1, { sequential: true })
  writeDynamicTexture(gl, ctx.textures, 'residual-grid', residualGrid, T, C)
  writeDynamicTexture(gl, ctx.textures, 'norm1-grid', normGrid, T, C)
  writeDynamicTexture(
    gl,
    ctx.textures,
    'attn-out-grid',
    buildCurrentPositionGrid(T, C, currentPosition, trace.attnOutput),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'attn-residual-grid',
    buildCurrentPositionGrid(T, C, currentPosition, trace.xAfterAttnResidual),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'norm2-grid',
    buildCurrentPositionGrid(T, C, currentPosition, rmsnorm(trace.xAfterAttnResidual)),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'mlp-fc-grid',
    buildCurrentPositionGrid(C * 4, T, currentPosition, trace.mlpHidden),
    C * 4,
    T,
    { sequential: true },
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'mlp-act-grid',
    buildCurrentPositionGrid(
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
    buildCurrentPositionGrid(T, C, currentPosition, trace.mlpOutput),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'mlp-residual-grid',
    buildCurrentPositionGrid(T, C, currentPosition, trace.xAfterMlpResidual),
    T,
    C,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'logits-grid',
    buildCurrentPositionGrid(T, V, currentPosition, trace.logits),
    T,
    V,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'probs-grid',
    buildCurrentPositionGrid(T, V, currentPosition, trace.probs),
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
  bindCubeTexture(ctx, block.ln1.lnAgg1, 'dynamic', 'context')
  bindCubeTexture(ctx, block.ln1.lnAgg2, 'dynamic', 'context')
  bindCubeTexture(ctx, block.ln1.lnResid, 'dynamic', 'norm1-grid')
  bindCubeTexture(ctx, block.projWeight, 'static', 'layer0.attn_wo')
  bindCubeTexture(ctx, block.attnOut, 'dynamic', 'attn-out-grid')
  bindCubeTexture(ctx, block.attnResidual, 'dynamic', 'attn-residual-grid')
  bindCubeTexture(ctx, block.ln2.lnAgg1, 'dynamic', 'sample-grid')
  bindCubeTexture(ctx, block.ln2.lnAgg2, 'dynamic', 'sample-grid')
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
  bindCubeTexture(ctx, ctx.layout.logitsAgg1, 'dynamic', 'sample-grid')
  bindCubeTexture(ctx, ctx.layout.logitsAgg2, 'dynamic', 'sample-grid')
  bindCubeTexture(ctx, ctx.layout.logitsSoftmax, 'dynamic', 'probs-grid')

  for (const [blockId, block] of Object.entries(ctx.layout.blocks) as Array<
    [MicroVizBlockId, MicroVizLayout['blocks'][MicroVizBlockId]]
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
  const focusIds = new Set(
    phaseState.focusBlockIds.map((blockId) => ctx.layout.blocks[blockId].codeFocusId),
  )
  const emphasisIds = new Set(
    phaseState.emphasisBlockIds.map((blockId) => ctx.layout.blocks[blockId].codeFocusId),
  )

  for (const cube of ctx.layout.cubes) {
    const focusId = ctx.layout.cubeFocusIds[cube.idx]
    if (focusId != null && focusIds.has(focusId)) {
      cube.opacity = 1
      cube.highlight = 1
      continue
    }
    if (focusId != null && emphasisIds.has(focusId)) {
      cube.opacity = 0.96
      cube.highlight = 0.52
      continue
    }
    cube.opacity = cube.name ? 0.82 : 0
    cube.highlight = cube.name ? 0.12 : 0
  }

  ctx.layout.embedLabel.visible = phaseState.phaseId.startsWith('token') || phaseState.phaseId.startsWith('position') || phaseState.phaseId === 'tokenize' ? 1 : 0.82
  for (const transformerBlock of ctx.layout.transformerBlocks) {
    transformerBlock.transformerLabel.visible = 0.92
    transformerBlock.selfAttendLabel.visible =
      phaseState.phaseId === 'qkv' ||
      phaseState.phaseId === 'attention-scores' ||
      phaseState.phaseId === 'attention-weights' ||
      phaseState.phaseId === 'weighted-values' ||
      phaseState.phaseId === 'attn-output-residual'
        ? 1
        : 0.72
    transformerBlock.projLabel.visible =
      phaseState.phaseId === 'attn-output-residual' ? 1 : 0.62
    transformerBlock.mlpLabel.visible =
      phaseState.phaseId === 'mlp' ? 1 : 0.72
    transformerBlock.heads.forEach((head, headIndex) => {
      const isActive = phaseState.focusBlockIds.includes(headBlockIds[headIndex]!)
      head.headLabel.visible = isActive ? 1 : 0.62
      head.qLabel.visible = phaseState.phaseId === 'qkv' ? 1 : 0.7
      head.kLabel.visible = phaseState.phaseId === 'qkv' ? 1 : 0.7
      head.vLabel.visible = phaseState.phaseId === 'qkv' ? 1 : 0.7
      head.mtxLabel.visible =
        phaseState.phaseId === 'attention-scores' ||
        phaseState.phaseId === 'attention-weights'
          ? 1
          : 0.6
      head.vectorLabel.visible = phaseState.phaseId === 'weighted-values' ? 1 : 0.6
    })
  }

  ctx.camera.desiredCamera = ctx.layout.cameraPoses[phaseState.cameraPoseId]
}

export function drawMicroVizEdges(
  ctx: MicroVizRenderContext,
  phaseState: MicroVizPhaseState,
) {
  ctx.renderState.sharedRender.activePhase = RenderPhase.Overlay
  const emphasized = new Set(phaseState.emphasisEdgeIds)

  for (const edge of ctx.layout.edges) {
    const from = ctx.layout.blocks[edge.from].cube
    const to = ctx.layout.blocks[edge.to].cube
    const active = emphasized.has(edge.id)
    const start = new Vec3(from.x + from.dx / 2, from.y + from.dy, from.z + from.dz / 2)
    const end = new Vec3(to.x + to.dx / 2, to.y, to.z + to.dz / 2)

    addLine(
      ctx.renderState.lineRender,
      active ? 2.6 : 1.4,
      active
        ? new Vec4(0.12, 0.7, 0.22, 0.88)
        : new Vec4(0.48, 0.76, 0.52, 0.38),
      start,
      end,
    )
  }
}
