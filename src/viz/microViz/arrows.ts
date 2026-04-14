import {
  BlockPos,
  CornerMode,
  drawArrow,
} from '../../vendor/llmVizOriginal/llm/components/Arrow'
import type { IBlkDef } from '../../vendor/llmVizOriginal/llm/GptModelLayout'
import type { IRenderState } from '../../vendor/llmVizOriginal/llm/render/modelRender'
import { Vec3, Vec4 } from '../../vendor/llmVizOriginal/utils/vector'
import type { MicroVizEdgeId, MicroVizLayout, MicroVizPhaseState } from './types'

const pad = 2
const residualWidth = 6
const weightColor = Vec4.fromHexColor('#3333aa')
const dataColor = Vec4.fromHexColor('#33aa33')

function blockColor(block: IBlkDef) {
  return block.t === 'w' ? weightColor : dataColor
}

function midpoint(block: IBlkDef, pos: BlockPos) {
  const z = block.z + block.dz / 2
  switch (pos) {
    case BlockPos.Left:
      return new Vec3(block.x - pad, block.y + block.dy / 2, z)
    case BlockPos.Right:
      return new Vec3(block.x + block.dx + pad, block.y + block.dy / 2, z)
    case BlockPos.Top:
      return new Vec3(block.x + block.dx / 2, block.y - pad, z)
    case BlockPos.Bot:
      return new Vec3(block.x + block.dx / 2, block.y + block.dy + pad, z)
  }
}

function edgeOpacity(active: boolean, left: IBlkDef, right: IBlkDef) {
  const base = Math.min(left.opacity, right.opacity)
  if (base <= 0) {
    return 0
  }
  return active ? Math.min(1, base * 1.05) : base * 0.74
}

function drawArrowBetween(
  state: IRenderState,
  activeEdges: Set<MicroVizEdgeId>,
  src: IBlkDef,
  srcPos: BlockPos,
  dest: IBlkDef,
  destPos: BlockPos,
  edgeId: MicroVizEdgeId | null,
  width = 6,
) {
  const active = edgeId ? activeEdges.has(edgeId) : false
  const opacity = edgeOpacity(active, src, dest)
  if (opacity <= 0) {
    return
  }

  const color = blockColor(src).mul(opacity)
  const normal = new Vec3(0, 0, 1)
  const start = midpoint(src, srcPos)
  const end = midpoint(dest, destPos)

  if (srcPos === BlockPos.Left && destPos === BlockPos.Right) {
    start.y = end.y
  }

  if (srcPos === BlockPos.Right && destPos === BlockPos.Top) {
    const mid0 = new Vec3(end.x - width / 2, start.y, start.z)
    const mid1 = new Vec3(end.x, start.y + width / 2, end.z)
    drawArrow(state, start, mid0, width, normal, color, false)
    drawArrow(state, mid1, end, width, normal, color, true, CornerMode.Left)
    return
  }

  if (srcPos === BlockPos.Bot && destPos === BlockPos.Right) {
    const mid0 = new Vec3(start.x, end.y - width / 2, end.z)
    const mid1 = new Vec3(start.x - width / 2, end.y, end.z)
    drawArrow(state, start, mid0, width, normal, color, false)
    drawArrow(state, mid1, end, width, normal, color, true, CornerMode.Left)
    return
  }

  if (srcPos === BlockPos.Bot && destPos === BlockPos.Left) {
    const mid0 = new Vec3(start.x, end.y - width / 2, end.z)
    const mid1 = new Vec3(start.x + width / 2, end.y, end.z)
    drawArrow(state, start, mid0, width, normal, color, false, CornerMode.None, new Vec3(0, 1, 0))
    drawArrow(state, mid1, end, width, normal, color, true, CornerMode.Right)
    return
  }

  drawArrow(state, start, end, width, normal, color, true)
}

function drawVerticalArrow(
  state: IRenderState,
  activeEdges: Set<MicroVizEdgeId>,
  src: IBlkDef,
  dest: IBlkDef,
  edgeId: MicroVizEdgeId | null,
  width = 6,
) {
  drawArrowBetween(state, activeEdges, src, BlockPos.Bot, dest, BlockPos.Top, edgeId, width)
}

function drawHorizontalArrow(
  state: IRenderState,
  activeEdges: Set<MicroVizEdgeId>,
  src: IBlkDef,
  dest: IBlkDef,
  edgeId: MicroVizEdgeId | null,
  width = 6,
) {
  drawArrowBetween(state, activeEdges, src, BlockPos.Right, dest, BlockPos.Left, edgeId, width)
}

function drawResidualSplit(
  state: IRenderState,
  activeEdges: Set<MicroVizEdgeId>,
  src: IBlkDef,
  dest: IBlkDef,
  edgeId: MicroVizEdgeId | null,
  width = 6,
) {
  const active = edgeId ? activeEdges.has(edgeId) : false
  const opacity = edgeOpacity(active, src, dest)
  if (opacity <= 0) {
    return
  }

  const start = midpoint(src, BlockPos.Bot)
  const end = midpoint(dest, BlockPos.Right)
  const mid1 = new Vec3(start.x - residualWidth / 2, end.y, end.z)
  drawArrow(
    state,
    mid1,
    end,
    width,
    new Vec3(0, 0, 1),
    blockColor(src).mul(opacity),
    true,
  )
}

function drawBottomToSide(
  state: IRenderState,
  layout: MicroVizLayout,
  activeEdges: Set<MicroVizEdgeId>,
  src: IBlkDef,
  dest: IBlkDef,
  edgeId: MicroVizEdgeId | null,
  offset: number,
  width = 6,
  forceOffset = false,
) {
  const active = edgeId ? activeEdges.has(edgeId) : false
  const opacity = edgeOpacity(active, src, dest)
  if (opacity <= 0) {
    return
  }

  const start = midpoint(src, BlockPos.Bot)
  const left = start.z > dest.z + dest.dz / 2
  let end = new Vec3(
    dest.x + dest.dx / 2,
    dest.y + layout.cell * (offset + 0.5),
    left ? dest.z + dest.dz / 2 + pad : dest.z - pad,
  )
  let endDir = new Vec3(0, 0, left ? -1 : 1)
  const areClose = Math.abs(start.z - (dest.z + dest.dz / 2)) < 1
  if (areClose && !forceOffset) {
    end = midpoint(dest, BlockPos.Top)
    endDir = undefined as never
  }
  drawArrow(
    state,
    start,
    end,
    width,
    new Vec3(0, 0, 1),
    blockColor(src).mul(opacity),
    true,
    CornerMode.None,
    endDir,
  )
}

export function drawMicroVizArrows(
  state: IRenderState,
  layout: MicroVizLayout,
  phaseState: MicroVizPhaseState,
) {
  const activeEdges = new Set(phaseState.emphasisEdgeIds)
  let prevResidual = layout.residual0

  drawVerticalArrow(state, activeEdges, layout.idxObj, layout.residual0, 'context-to-token-embedding')
  drawHorizontalArrow(state, activeEdges, layout.tokEmbedObj, layout.residual0, 'token-embedding-to-residual-stream')
  drawArrowBetween(
    state,
    activeEdges,
    layout.posEmbedObj,
    BlockPos.Left,
    layout.residual0,
    BlockPos.Right,
    'position-embedding-to-residual-stream',
  )

  for (const block of layout.blocks) {
    drawVerticalArrow(state, activeEdges, prevResidual, block.attnResidual, 'attention-out-to-residual-add-1')
    drawResidualSplit(state, activeEdges, prevResidual, block.ln1.lnResid, 'residual-stream-to-norm-1')
    drawResidualSplit(state, activeEdges, prevResidual, block.ln1.lnAgg2, 'residual-stream-to-norm-1', 2)
    drawVerticalArrow(state, activeEdges, block.ln1.lnAgg2, block.ln1.lnResid, 'residual-stream-to-norm-1', 2)

    block.heads.forEach((head, headIndex) => {
      const qEdge = (`qkv-to-attention-head-${headIndex + 1}` as MicroVizEdgeId)
      drawArrowBetween(state, activeEdges, block.ln1.lnResid, BlockPos.Left, head.qBlock, BlockPos.Right, 'norm-1-to-q-project')
      drawArrowBetween(state, activeEdges, block.ln1.lnResid, BlockPos.Left, head.kBlock, BlockPos.Right, 'norm-1-to-k-project')
      drawArrowBetween(state, activeEdges, block.ln1.lnResid, BlockPos.Left, head.vBlock, BlockPos.Right, 'norm-1-to-v-project')

      drawHorizontalArrow(state, activeEdges, head.qBiasBlock, head.qWeightBlock, null)
      drawHorizontalArrow(state, activeEdges, head.kBiasBlock, head.kWeightBlock, null)
      drawHorizontalArrow(state, activeEdges, head.vBiasBlock, head.vWeightBlock, null)
      drawHorizontalArrow(state, activeEdges, head.qWeightBlock, head.qBlock, 'norm-1-to-q-project')
      drawHorizontalArrow(state, activeEdges, head.kWeightBlock, head.kBlock, 'norm-1-to-k-project')
      drawHorizontalArrow(state, activeEdges, head.vWeightBlock, head.vBlock, 'norm-1-to-v-project')

      drawBottomToSide(state, layout, activeEdges, head.qBlock, head.attnMtx, qEdge, 0, 6, head.qBlock.y !== head.kBlock.y)
      drawBottomToSide(state, layout, activeEdges, head.kBlock, head.attnMtx, qEdge, 0, 6, head.kBlock.y !== head.qBlock.y)
      drawBottomToSide(state, layout, activeEdges, head.vBlock, head.vOutBlock, qEdge, 0, 6, head.vBlock.y !== head.kBlock.y)

      drawArrowBetween(state, activeEdges, head.attnMtx, BlockPos.Left, head.attnMtxAgg2, BlockPos.Right, qEdge)
      drawArrowBetween(state, activeEdges, head.attnMtxAgg1, BlockPos.Left, head.attnMtxSm, BlockPos.Right, qEdge)
      drawArrowBetween(state, activeEdges, head.attnMtxSm, BlockPos.Bot, head.vOutBlock, BlockPos.Left, qEdge)
      drawArrowBetween(
        state,
        activeEdges,
        head.vOutBlock,
        BlockPos.Bot,
        block.attnOut,
        BlockPos.Top,
        (`attention-head-${headIndex + 1}-to-attention-out` as MicroVizEdgeId),
      )
    })

    drawVerticalArrow(state, activeEdges, block.attnResidual, block.mlpResidual, 'residual-add-1-to-norm-2')
    drawHorizontalArrow(state, activeEdges, block.attnOut, block.attnResidual, 'attention-out-to-residual-add-1')
    drawHorizontalArrow(state, activeEdges, block.projBias, block.projWeight, null)
    drawHorizontalArrow(state, activeEdges, block.projWeight, block.attnOut, 'attention-head-1-to-attention-out')

    drawResidualSplit(state, activeEdges, block.attnResidual, block.ln2.lnAgg2, 'residual-add-1-to-norm-2', 2)
    drawVerticalArrow(state, activeEdges, block.ln2.lnAgg2, block.ln2.lnResid, 'residual-add-1-to-norm-2', 2)
    drawResidualSplit(state, activeEdges, block.attnResidual, block.ln2.lnResid, 'residual-add-1-to-norm-2')
    drawArrowBetween(state, activeEdges, block.ln2.lnResid, BlockPos.Bot, block.mlpFc, BlockPos.Right, 'norm-2-to-mlp-fc1')

    drawVerticalArrow(state, activeEdges, block.mlpFcBias, block.mlpFcWeight, null)
    drawVerticalArrow(state, activeEdges, block.mlpFcWeight, block.mlpFc, 'norm-2-to-mlp-fc1', 12)
    drawVerticalArrow(state, activeEdges, block.mlpFc, block.mlpAct, 'mlp-fc1-to-mlp-relu', 12)
    drawHorizontalArrow(state, activeEdges, block.mlpProjBias, block.mlpProjWeight, null)
    drawHorizontalArrow(state, activeEdges, block.mlpProjWeight, block.mlpResult, 'mlp-relu-to-mlp-fc2')
    drawHorizontalArrow(state, activeEdges, block.mlpResult, block.mlpResidual, 'mlp-fc2-to-logits')
    drawArrowBetween(state, activeEdges, block.mlpAct, BlockPos.Right, block.mlpResult, BlockPos.Top, 'mlp-relu-to-mlp-fc2')

    prevResidual = block.mlpResidual
  }

  drawVerticalArrow(state, activeEdges, prevResidual, layout.logits, 'mlp-fc2-to-logits')
  drawHorizontalArrow(state, activeEdges, layout.lmHeadWeight, layout.logits, 'mlp-fc2-to-logits')
  drawVerticalArrow(state, activeEdges, layout.logits, layout.logitsAgg2, 'logits-to-probabilities')
  drawVerticalArrow(state, activeEdges, layout.logitsAgg1, layout.logitsSoftmax, 'logits-to-probabilities')
  drawVerticalArrow(state, activeEdges, layout.logitsSoftmax, layout.sampleBlock, 'probabilities-to-sample')
}
