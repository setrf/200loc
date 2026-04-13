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

function createDynamicTextures(
  gl: WebGL2RenderingContext,
  model: MicroVizStaticModel,
): MicroVizTextureSet {
  const textures: MicroVizTextureSet = {
    staticTextures: {},
    dynamicTextures: {
      'x-after-embed': createBufferTex(gl, model.config.nEmbd, 1, 1),
      'x-after-norm': createBufferTex(gl, model.config.nEmbd, 1, 1),
      'x-after-attn-residual': createBufferTex(gl, model.config.nEmbd, 1, 1),
      'norm-2-input': createBufferTex(gl, model.config.nEmbd, 1, 1),
      'mlp-hidden': createBufferTex(gl, model.config.nEmbd * 4, 1, 1),
      probs: createBufferTex(gl, model.config.vocabSize, 1, 1),
      sample: createBufferTex(gl, model.config.vocabSize, 1, 1),
      'context-mask': createBufferTex(gl, model.config.blockSize, 1, 1),
      ...Object.fromEntries(
        headBlockIds.flatMap((blockId) => [
          [`${blockId}-scores`, createBufferTex(gl, model.config.blockSize, 1, 1)],
          [`${blockId}-weights`, createBufferTex(gl, model.config.blockSize, 1, 1)],
          [
            `${blockId}-values`,
            createBufferTex(gl, model.config.headDim, model.config.blockSize, 1),
          ],
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
      return ['attention-head-1', 'attention-head-2', 'attention-head-3', 'attention-head-4', 'attention-out']
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

function getHeadBindingKey(phaseId: PhaseDefinition['id'], headIndex: number) {
  const blockId = headBlockIds[headIndex]!
  switch (phaseId) {
    case 'attention-scores':
      return `${blockId}-scores`
    case 'weighted-values':
      return `${blockId}-values`
    default:
      return `${blockId}-weights`
  }
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
    context: makeBinding('dynamic', 'context-mask'),
    'token-embedding': makeBinding('static', 'wte'),
    'position-embedding': makeBinding('static', 'wpe'),
    'residual-stream': makeBinding('dynamic', 'x-after-embed'),
    'norm-1': makeBinding('dynamic', 'x-after-norm'),
    'q-project': makeBinding('static', 'layer0.attn_wq'),
    'k-project': makeBinding('static', 'layer0.attn_wk'),
    'v-project': makeBinding('static', 'layer0.attn_wv'),
    'attention-out': makeBinding('static', 'layer0.attn_wo'),
    'residual-add-1': makeBinding('dynamic', 'x-after-attn-residual'),
    'norm-2': makeBinding('dynamic', 'norm-2-input'),
    'mlp-fc1': makeBinding('static', 'layer0.mlp_fc1'),
    'mlp-relu': makeBinding('dynamic', 'mlp-hidden'),
    'mlp-fc2': makeBinding('static', 'layer0.mlp_fc2'),
    logits: makeBinding('static', 'lm_head'),
    probabilities: makeBinding('dynamic', 'probs'),
    sample: makeBinding('dynamic', 'sample'),
  }

  for (let headIndex = 0; headIndex < layout.shape.nHeads; headIndex += 1) {
    const blockId = headBlockIds[headIndex]!
    blockBindings[blockId] = makeBinding(
      'dynamic',
      getHeadBindingKey(phase.id, headIndex),
    )
  }

  return {
    phaseId: phase.id,
    cameraPoseId: frame.cameraPoseId,
    focusBlockIds,
    emphasisBlockIds: unique([...focusBlockIds, ...emphasisBlockIds]),
    emphasisEdgeIds,
    dimmedBlockIds: (Object.keys(layout.blocks) as MicroVizBlockId[]).filter(
      (blockId) => !emphasisBlockIds.includes(blockId) && !focusBlockIds.includes(blockId),
    ),
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
  values: readonly number[],
  width: number,
  height: number,
  options: {
    sequential?: boolean
    sampledTokenId?: number
  } = {},
) {
  const texture = textures.dynamicTextures[key]
  if (!texture) {
    return
  }

  const buffer = new Float32Array(width * height)
  buffer.fill(0)
  buffer.set(values.slice(0, width * height))

  if (options.sampledTokenId != null && options.sampledTokenId < buffer.length) {
    buffer.fill(0)
    buffer[options.sampledTokenId] = 1
  }

  writeToBufferTex(gl, texture, buffer)
  textures.scales[key] = options.sequential
    ? 1 / maxValue(buffer)
    : 1 / maxAbs(buffer)
}

export function uploadMicroVizFrame(
  ctx: MicroVizRenderContext,
  model: MicroVizStaticModel,
  phaseState: MicroVizPhaseState,
  trace: TokenStepTrace,
  visibleTokenCount: number,
) {
  const { gl } = ctx.renderState
  const contextMask = new Array(model.config.blockSize).fill(0)
  for (
    let index = 0;
    index < Math.min(model.config.blockSize, visibleTokenCount);
    index += 1
  ) {
    contextMask[index] = 1
  }
  writeDynamicTexture(gl, ctx.textures, 'context-mask', contextMask, model.config.blockSize, 1, { sequential: true })

  writeDynamicTexture(gl, ctx.textures, 'x-after-embed', trace.xAfterEmbed, model.config.nEmbd, 1)
  writeDynamicTexture(gl, ctx.textures, 'x-after-norm', trace.xAfterNorm, model.config.nEmbd, 1)
  writeDynamicTexture(
    gl,
    ctx.textures,
    'x-after-attn-residual',
    trace.xAfterAttnResidual,
    model.config.nEmbd,
    1,
  )
  writeDynamicTexture(
    gl,
    ctx.textures,
    'norm-2-input',
    rmsnorm(trace.xAfterAttnResidual),
    model.config.nEmbd,
    1,
  )
  writeDynamicTexture(gl, ctx.textures, 'mlp-hidden', trace.mlpHidden, model.config.nEmbd * 4, 1, {
    sequential: true,
  })
  writeDynamicTexture(gl, ctx.textures, 'probs', trace.probs, model.config.vocabSize, 1, {
    sequential: true,
  })
  writeDynamicTexture(
    gl,
    ctx.textures,
    'sample',
    trace.probs,
    model.config.vocabSize,
    1,
    { sequential: true, sampledTokenId: trace.sampledTokenId },
  )

  for (let headIndex = 0; headIndex < model.config.nHead; headIndex += 1) {
    const blockId = headBlockIds[headIndex]!
    const head = trace.heads[headIndex]
    if (!head) {
      continue
    }
    writeDynamicTexture(
      gl,
      ctx.textures,
      `${blockId}-scores`,
      head.scores,
      model.config.blockSize,
      1,
    )
    writeDynamicTexture(
      gl,
      ctx.textures,
      `${blockId}-weights`,
      head.weights,
      model.config.blockSize,
      1,
      { sequential: true },
    )
    writeDynamicTexture(
      gl,
      ctx.textures,
      `${blockId}-values`,
      head.vSlices.flat(),
      model.config.headDim,
      model.config.blockSize,
    )
  }

  for (const [blockId, block] of Object.entries(ctx.layout.blocks) as Array<
    [MicroVizBlockId, MicroVizLayout['blocks'][MicroVizBlockId]]
  >) {
    const binding = phaseState.blockBindings[blockId]
    const access = block.cube.access
    if (!access || !binding) {
      continue
    }
    access.disable = false
    access.src =
      binding.kind === 'static'
        ? ctx.textures.staticTextures[binding.key]
        : ctx.textures.dynamicTextures[binding.key]
    access.scale = ctx.textures.scales[binding.key] ?? 1
  }
}

export function applyMicroVizPhase(
  ctx: MicroVizRenderContext,
  phaseState: MicroVizPhaseState,
) {
  const focused = new Set(phaseState.focusBlockIds)
  const emphasized = new Set(phaseState.emphasisBlockIds)
  for (const [blockId, block] of Object.entries(ctx.layout.blocks) as Array<
    [MicroVizBlockId, MicroVizLayout['blocks'][MicroVizBlockId]]
  >) {
    if (focused.has(blockId)) {
      block.cube.opacity = 1
      block.cube.highlight = 1
      continue
    }

    if (emphasized.has(blockId)) {
      block.cube.opacity = 0.92
      block.cube.highlight = 0.46
      continue
    }

    block.cube.opacity = 0.2
    block.cube.highlight = 0.08
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
      active ? 2.4 : 1.1,
      active ? new Vec4(0.39, 0.69, 0.94, 0.92) : new Vec4(0.32, 0.38, 0.48, 0.28),
      start,
      end,
    )
  }
}
