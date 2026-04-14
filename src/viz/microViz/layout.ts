import type { SceneModelData, VizEdgeId, VizNodeId } from '../llmViz/types'
import type {
  MicroVizBlock,
  MicroVizBlockId,
  MicroVizEdge,
  MicroVizEdgeId,
  MicroVizHeadGroup,
  MicroVizLayout,
  MicroVizNormGroup,
  MicroVizShape,
  MicroVizTransformerBlock,
} from './types'
import { Mat4f } from '../../vendor/llmVizOriginal/utils/matrix'
import { Vec3 } from '../../vendor/llmVizOriginal/utils/vector'
import {
  BlKDepSpecial,
  BlkSpecial,
  type IBlkAccess,
  type IBlkCellDep,
  type IBlkDef,
  type IBlkDeps,
  type IBlkLabel,
} from '../../vendor/llmVizOriginal/llm/GptModelLayout'
import { DimStyle } from '../../vendor/llmVizOriginal/llm/walkthrough/WalkthroughTools'

const cell = 5
const margin = 12
function makeAccessMatrix(x: number[], y: number[]) {
  const x4 = x.length === 4 ? x : [...x, 0]
  const y4 = y.length === 4 ? y : [...y, 0]
  return Mat4f.fromColMajor([...x4, ...y4, 0, 0, 0, 0, 0, 0, 0, 0])
}

function createAccess(
  x: number[] = [1, 0, 0],
  y: number[] = [0, 1, 0],
  scale = 1,
): IBlkAccess {
  return {
    src: null as never,
    channel: 'r',
    scale,
    mat: makeAccessMatrix(x, y),
    disable: true,
  }
}

interface DepArgs {
  dot?: [[IBlkDef, string], [IBlkDef, string]]
  dotLen?: number
  add?: [IBlkDef, string][]
  lowerTri?: boolean
  special?: BlKDepSpecial
}

function parseDepIdxStr(str: string) {
  const depIdxVars = '0xybi'
  const mtx = Mat4f.zeros()
  for (let destI = 0; destI < str.length; destI += 1) {
    const srcIdx = depIdxVars.indexOf(str[destI]!)
    if (srcIdx > 0) {
      mtx.s(destI, srcIdx - 1, 1)
    }
  }
  return mtx
}

function makeBlkDep(src: IBlkDef, depStr: string): IBlkCellDep {
  return { src, srcIdxMtx: parseDepIdxStr(depStr) }
}

function makeDeps(value: DepArgs): IBlkDeps {
  return {
    dot: value.dot?.map(([src, depStr]) => makeBlkDep(src, depStr)) as
      | [IBlkCellDep, IBlkCellDep]
      | undefined,
    dotLen: value.dotLen,
    add: value.add?.map(([src, depStr]) => makeBlkDep(src, depStr)),
    lowerTri: value.lowerTri,
    special: value.special ?? BlKDepSpecial.None,
  }
}

function mkLabel(visible: number, cubes: IBlkDef[]) {
  return { visible, cubes } satisfies IBlkLabel
}

function countParams(model: SceneModelData) {
  return Object.values(model.weights).reduce(
    (total, matrix) => total + matrix.rows * matrix.cols,
    0,
  )
}

function makeBlock(
  id: MicroVizBlockId,
  cube: IBlkDef,
  codeFocusId: VizNodeId | VizEdgeId | null,
) {
  return { id, cube, codeFocusId } satisfies MicroVizBlock
}

function makeEdge(
  id: MicroVizEdgeId,
  from: MicroVizBlockId,
  to: MicroVizBlockId,
  codeFocusId: VizEdgeId | VizNodeId | null,
) {
  return { id, from, to, codeFocusId } satisfies MicroVizEdge
}

export function buildMicroVizLayout(model: SceneModelData): MicroVizLayout {
  const shape: MicroVizShape = {
    B: 1,
    T: model.config.blockSize,
    C: model.config.nEmbd,
    A: model.config.headDim,
    nHeads: model.config.nHead,
    nBlocks: model.config.nLayer,
    vocabSize: model.config.vocabSize,
  }

  let y = 0
  const cubes: IBlkDef[] = []
  const cubeFocusIds: Record<number, VizNodeId | VizEdgeId | null> = {}

  function registerCube(cube: IBlkDef, focusId: VizNodeId | VizEdgeId | null) {
    cube.idx = cubes.length
    cubes.push(cube)
    cubeFocusIds[cube.idx] = focusId
  }

  function mk(args: {
    t: 'w' | 'i' | 'a'
    xL?: number
    xR?: number
    xM?: number
    zF?: number
    zB?: number
    zM?: number
    y: number
    cx: number
    cy: number
    cz?: number
    name: string
    dimX?: DimStyle
    dimY?: DimStyle
    special?: BlkSpecial
    hidden?: boolean
    small?: boolean
  }) {
    const dx = args.cx * cell
    const dy = args.cy * cell
    const dz = (args.cz ?? 1) * cell
    const x =
      args.xL != null
        ? args.xL
        : args.xR != null
          ? args.xR - dx
          : (args.xM ?? 0) - dx / 2
    const z =
      args.zB != null
        ? args.zB
        : args.zF != null
          ? args.zF - dz
          : (args.zM ?? 0) - dz / 2

    const cube: IBlkDef = {
      idx: -1,
      t: args.t,
      x,
      y: args.y,
      z,
      dx,
      dy,
      dz,
      cx: args.cx,
      cy: args.cy,
      cz: args.cz ?? 1,
      dimX:
        args.dimX ?? (args.t === 'w' ? DimStyle.Weights : DimStyle.Intermediates),
      dimY:
        args.dimY ?? (args.t === 'w' ? DimStyle.Weights : DimStyle.Intermediates),
      name: args.name,
      access: createAccess(),
      deps: undefined,
      opacity: args.hidden ? 0 : 0.82,
      highlight: 0.24,
      small: args.small ?? false,
      special: args.special ?? BlkSpecial.None,
      localMtx: Mat4f.identity,
    }
    return cube
  }

  const leftX = -(shape.T * cell) / 2 - margin
  const rightX = (shape.T * cell) / 2 + margin

  const idxObj = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: 1,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.None,
    name: 'tokens',
  })
  idxObj.access = createAccess([1, 0, 0], [0, 0, 0], 1 / Math.max(1, shape.vocabSize - 1))
  registerCube(idxObj, 'context')

  y += cell + margin

  const tokEmbedObj = mk({
    t: 'w',
    xR: leftX,
    zM: 0,
    y,
    cx: shape.C,
    cy: shape.vocabSize,
    name: 'token embed',
    dimX: DimStyle.C,
    dimY: DimStyle.n_vocab,
  })
  tokEmbedObj.access = createAccess([1, 0, 0], [0, 1, 0], 10)
  const posEmbedObj = mk({
    t: 'w',
    xL: rightX,
    zM: 0,
    y,
    cx: shape.C,
    cy: shape.T,
    name: 'position embed',
    dimX: DimStyle.C,
    dimY: DimStyle.T,
  })
  posEmbedObj.access = createAccess([1, 0, 0], [0, 1, 0], 10)
  const residual0 = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: shape.C,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.C,
    name: 'input embed',
  })
  residual0.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  residual0.deps = makeDeps({
    add: [[tokEmbedObj, 'iy'], [posEmbedObj, 'xy'], [idxObj, 'x0']],
    special: BlKDepSpecial.InputEmbed,
  })
  registerCube(tokEmbedObj, 'token-embedding')
  registerCube(posEmbedObj, 'position-embedding')
  registerCube(residual0, 'residual-stream')
  const embedLabel = mkLabel(1, [idxObj, tokEmbedObj, posEmbedObj, residual0])

  y += shape.C * cell + margin * 2

  function createRmsNorm(
    source: IBlkDef,
    focusId: VizNodeId,
    title: string,
  ): MicroVizNormGroup {
    const aggLeft = leftX - (shape.T + 2) * cell - 2 * margin
    const lnAgg1 = mk({
      t: 'a',
      xR: aggLeft,
      zM: 0,
      y,
      cx: shape.T,
      cy: 1,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.None,
      name: `${title} mean`,
      small: true,
    })
    lnAgg1.access = createAccess([1, 0, 0], [0, 0, 0], 1)
    lnAgg1.deps = makeDeps({
      add: [[source, 'xi']],
      special: BlKDepSpecial.RmsNormAggMeanSquare,
    })
    const lnAgg2 = mk({
      t: 'a',
      xR: aggLeft,
      zM: 0,
      y: y + cell,
      cx: shape.T,
      cy: 1,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.None,
      name: `${title} rms`,
      small: true,
    })
    lnAgg2.access = createAccess([1, 0, 0], [0, 0, 0], 1)
    lnAgg2.deps = makeDeps({
      add: [[source, 'xi'], [lnAgg1, 'x0']],
      special: BlKDepSpecial.RmsNormAggRms,
    })
    const hiddenLeft = aggLeft - shape.T * cell - margin
    const lnSigma = mk({
      t: 'w',
      xR: hiddenLeft,
      zM: 0,
      y: y + 2 * cell + margin,
      cx: 1,
      cy: shape.C,
      name: '',
      hidden: true,
      small: true,
    })
    lnSigma.access = createAccess([0, 0, 0], [0, 1, 0], 1)
    const lnMu = mk({
      t: 'w',
      xR: hiddenLeft - cell - margin,
      zM: 0,
      y: y + 2 * cell + margin,
      cx: 1,
      cy: shape.C,
      name: '',
      hidden: true,
      small: true,
    })
    lnMu.access = createAccess([0, 0, 0], [0, 1, 0], 1)
    const lnResid = mk({
      t: 'i',
      xM: 0,
      zM: 0,
      y: y + 2 * cell + margin,
      cx: shape.T,
      cy: shape.C,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.C,
      name: title,
    })
    lnResid.access = createAccess([1, 0, 0], [0, 1, 0], 1)
    lnResid.deps = makeDeps({
      add: [[source, 'xy'], [lnAgg1, 'x0'], [lnAgg2, 'x0']],
      special: BlKDepSpecial.RmsNorm,
    })
    registerCube(lnAgg1, focusId)
    registerCube(lnAgg2, focusId)
    registerCube(lnSigma, focusId)
    registerCube(lnMu, focusId)
    registerCube(lnResid, focusId)
    y = lnResid.y + lnResid.dy + margin
    return {
      lnAgg1,
      lnAgg2,
      lnSigma,
      lnMu,
      lnResid,
      cubes: [lnAgg1, lnAgg2, lnSigma, lnMu, lnResid],
    }
  }

  function createHead(headIndex: number, ln1: MicroVizNormGroup, topY: number) {
    const groupSpan = shape.A * cell * 3 + margin * 2
    const headSpan = groupSpan + margin * 2
    const headMid = (headIndex - (shape.nHeads - 1) / 2) * headSpan
    const qMid = headMid + shape.A * cell + margin
    const kMid = headMid
    const vMid = headMid - shape.A * cell - margin
    const weightLeft = leftX - (shape.T + 2) * cell - 4 * margin - shape.C * cell
    const vectorLeft = leftX - (shape.T + 2) * cell - 2 * margin
    const attnSoftmaxLeft = vectorLeft - (shape.T + 2) * cell - 2 * margin

    const qWeightBlock = mk({
      t: 'w',
      xR: weightLeft,
      zM: qMid,
      y: topY,
      cx: shape.C,
      cy: shape.A,
      name: 'Q weights',
      dimX: DimStyle.C,
      dimY: DimStyle.A,
    })
    qWeightBlock.access = createAccess([1, 0, 0], [0, 1, 0], shape.C * 0.25)
    const kWeightBlock = mk({
      t: 'w',
      xR: weightLeft,
      zM: kMid,
      y: topY,
      cx: shape.C,
      cy: shape.A,
      name: 'K weights',
      dimX: DimStyle.C,
      dimY: DimStyle.A,
    })
    kWeightBlock.access = createAccess([1, 0, 0], [0, 1, 0], shape.C * 0.25)
    const vWeightBlock = mk({
      t: 'w',
      xR: weightLeft,
      zM: vMid,
      y: topY,
      cx: shape.C,
      cy: shape.A,
      name: 'V weights',
      dimX: DimStyle.C,
      dimY: DimStyle.A,
    })
    vWeightBlock.access = createAccess([1, 0, 0], [0, 1, 0], shape.C * 0.25)
    const qBiasBlock = mk({
      t: 'w',
      xR: weightLeft - shape.C * cell - margin,
      zM: qMid,
      y: topY,
      cx: 1,
      cy: shape.A,
      name: '',
      hidden: true,
      small: true,
    })
    qBiasBlock.access = createAccess([0, 0, 0], [0, 1, 0], 1)
    const kBiasBlock = mk({
      t: 'w',
      xR: weightLeft - shape.C * cell - margin,
      zM: kMid,
      y: topY,
      cx: 1,
      cy: shape.A,
      name: '',
      hidden: true,
      small: true,
    })
    kBiasBlock.access = createAccess([0, 0, 0], [0, 1, 0], 1)
    const vBiasBlock = mk({
      t: 'w',
      xR: weightLeft - shape.C * cell - margin,
      zM: vMid,
      y: topY,
      cx: 1,
      cy: shape.A,
      name: '',
      hidden: true,
      small: true,
    })
    vBiasBlock.access = createAccess([0, 0, 0], [0, 1, 0], 1)
    const qBlock = mk({
      t: 'i',
      xR: vectorLeft,
      zM: qMid,
      y: topY,
      cx: shape.T,
      cy: shape.A,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.A,
      name: 'Q vectors',
    })
    qBlock.access = createAccess([1, 0, 0], [0, 1, 0], 1)
    qBlock.deps = makeDeps({
      dot: [[qWeightBlock, 'iy'], [ln1.lnResid, 'xi']],
      add: [[qBiasBlock, '0y']],
      dotLen: shape.C,
      special: BlKDepSpecial.None,
    })
    const kBlock = mk({
      t: 'i',
      xR: vectorLeft,
      zM: kMid,
      y: topY,
      cx: shape.T,
      cy: shape.A,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.A,
      name: 'K vectors',
    })
    kBlock.access = createAccess([1, 0, 0], [0, 1, 0], 1)
    kBlock.deps = makeDeps({
      dot: [[kWeightBlock, 'iy'], [ln1.lnResid, 'xi']],
      add: [[kBiasBlock, '0y']],
      dotLen: shape.C,
      special: BlKDepSpecial.None,
    })
    const vBlock = mk({
      t: 'i',
      xR: vectorLeft,
      zM: vMid,
      y: topY,
      cx: shape.T,
      cy: shape.A,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.A,
      name: 'V vectors',
    })
    vBlock.access = createAccess([1, 0, 0], [0, 1, 0], 1)
    vBlock.deps = makeDeps({
      dot: [[vWeightBlock, 'iy'], [ln1.lnResid, 'xi']],
      add: [[vBiasBlock, '0y']],
      dotLen: shape.C,
      special: BlKDepSpecial.None,
    })

    const attnMtx = mk({
      t: 'i',
      xR: vectorLeft,
      zM: headMid,
      y: topY + shape.A * cell + margin,
      cx: shape.T,
      cy: shape.T,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.T,
      name: 'attention scores',
      special: BlkSpecial.Attention,
    })
    attnMtx.access = createAccess([1, 0, 0], [0, 1, 0], 1)
    attnMtx.deps = makeDeps({
      dot: [[qBlock, 'yi'], [kBlock, 'xi']],
      lowerTri: true,
      dotLen: shape.A,
      special: BlKDepSpecial.Attention,
    })
    const attnMtxAgg1 = mk({
      t: 'a',
      xR: attnSoftmaxLeft,
      zM: headMid,
      y: attnMtx.y,
      cx: 1,
      cy: shape.T,
      cz: shape.B,
      dimX: DimStyle.None,
      dimY: DimStyle.T,
      name: '',
      small: true,
    })
    attnMtxAgg1.access = createAccess([0, 0, 0], [0, 1, 0], 1)
    attnMtxAgg1.deps = makeDeps({
      add: [[attnMtx, 'iy']],
      special: BlKDepSpecial.SoftmaxAggExp,
    })
    const attnMtxAgg2 = mk({
      t: 'a',
      xR: attnSoftmaxLeft - cell - margin / 2,
      zM: headMid,
      y: attnMtx.y,
      cx: 1,
      cy: shape.T,
      cz: shape.B,
      dimX: DimStyle.None,
      dimY: DimStyle.T,
      name: '',
      small: true,
    })
    attnMtxAgg2.access = createAccess([0, 0, 0], [0, 1, 0], 1)
    attnMtxAgg2.deps = makeDeps({
      add: [[attnMtx, 'iy']],
      special: BlKDepSpecial.SoftmaxAggMax,
    })
    const attnMtxSm = mk({
      t: 'i',
      xR: attnSoftmaxLeft - (shape.T + 2) * cell - margin,
      zM: headMid,
      y: attnMtx.y,
      cx: shape.T,
      cy: shape.T,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.T,
      name: 'attention',
      special: BlkSpecial.Attention,
    })
    attnMtxSm.access = createAccess([1, 0, 0], [0, 1, 0], 1)
    attnMtxSm.deps = makeDeps({
      add: [[attnMtx, 'xy'], [attnMtxAgg1, 'x0'], [attnMtxAgg2, 'x0']],
      lowerTri: true,
      special: BlKDepSpecial.Softmax,
    })
    const vOutBlock = mk({
      t: 'i',
      xR: vectorLeft,
      zM: headMid,
      y: attnMtx.y + shape.T * cell + margin,
      cx: shape.T,
      cy: shape.A,
      cz: shape.B,
      dimX: DimStyle.T,
      dimY: DimStyle.A,
      name: 'head output',
    })
    vOutBlock.access = createAccess([1, 0, 0], [0, 1, 0], 1)
    vOutBlock.deps = makeDeps({
      dot: [[vBlock, 'iy'], [attnMtxSm, 'ix']],
      dotLen: shape.A,
      special: BlKDepSpecial.None,
    })

    const focusId = (`attention-head-${headIndex + 1}` as VizNodeId) satisfies VizNodeId
    ;[
      qWeightBlock,
      kWeightBlock,
      vWeightBlock,
      qBiasBlock,
      kBiasBlock,
      vBiasBlock,
      qBlock,
      kBlock,
      vBlock,
      attnMtx,
      attnMtxAgg1,
      attnMtxAgg2,
      attnMtxSm,
      vOutBlock,
    ].forEach((cube) => registerCube(cube, focusId))

    const headCubes = [
      qWeightBlock,
      kWeightBlock,
      vWeightBlock,
      qBiasBlock,
      kBiasBlock,
      vBiasBlock,
      qBlock,
      kBlock,
      vBlock,
      attnMtx,
      attnMtxAgg1,
      attnMtxAgg2,
      attnMtxSm,
      vOutBlock,
    ]

    const qLabel = mkLabel(0.78, [qWeightBlock, qBlock])
    const kLabel = mkLabel(0.78, [kWeightBlock, kBlock])
    const vLabel = mkLabel(0.78, [vWeightBlock, vBlock])
    const biasLabel = mkLabel(0, [qBiasBlock, kBiasBlock, vBiasBlock])
    const mtxLabel = mkLabel(0.68, [attnMtx, attnMtxSm])
    const vectorLabel = mkLabel(0.68, [vOutBlock])
    const headLabel = mkLabel(0.9, headCubes)

    return {
      qWeightBlock,
      kWeightBlock,
      vWeightBlock,
      qBiasBlock,
      kBiasBlock,
      vBiasBlock,
      qBlock,
      kBlock,
      vBlock,
      attnMtx,
      attnMtxAgg1,
      attnMtxAgg2,
      attnMtxSm,
      vOutBlock,
      qLabel,
      kLabel,
      vLabel,
      biasLabel,
      mtxLabel,
      vectorLabel,
      headLabel,
      cubes: headCubes,
      labels: [qLabel, kLabel, vLabel, biasLabel, mtxLabel, vectorLabel, headLabel],
    } satisfies MicroVizHeadGroup
  }

  const ln1 = createRmsNorm(residual0, 'norm-1', 'rmsnorm 1')
  const headTop = ln1.lnResid.y
  const heads = Array.from({ length: shape.nHeads }, (_, headIndex) =>
    createHead(headIndex, ln1, headTop),
  )

  const attnBottom = Math.max(...heads.map((head) => head.vOutBlock.y + head.vOutBlock.dy))
  const projLeft = leftX - (shape.T + 2) * cell - 4 * margin - shape.C * cell
  const attnOut = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y: attnBottom + margin,
    cx: shape.T,
    cy: shape.C,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.C,
    name: 'attention out',
  })
  attnOut.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  const projWeight = mk({
    t: 'w',
    xR: projLeft,
    zM: 0,
    y: attnOut.y,
    cx: shape.C,
    cy: shape.C,
    name: 'projection',
    dimX: DimStyle.C,
    dimY: DimStyle.C,
  })
  projWeight.access = createAccess([1, 0, 0], [0, 1, 0], shape.C * 0.5)
  const projBias = mk({
    t: 'w',
    xR: projLeft - shape.C * cell - margin,
    zM: 0,
    y: attnOut.y,
    cx: 1,
    cy: shape.C,
    name: '',
    hidden: true,
    small: true,
  })
  projBias.access = createAccess([0, 0, 0], [0, 1, 0], 1)
  const attnResidual = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y: attnOut.y,
    cx: shape.T,
    cy: shape.C,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.C,
    name: 'attention residual',
  })
  attnResidual.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  attnOut.deps = makeDeps({
    dot: [[projWeight, 'iy'], [heads[0]!.vOutBlock, 'xi']],
    add: [[projBias, '0y'], ...heads.map((head) => [head.vOutBlock, 'xi'] as [IBlkDef, string])],
    dotLen: shape.C,
    special: BlKDepSpecial.None,
  })
  attnResidual.deps = makeDeps({
    add: [[attnOut, 'xy'], [residual0, 'xy']],
    special: BlKDepSpecial.None,
  })
  ;[projWeight, projBias, attnOut, attnResidual].forEach((cube) =>
    registerCube(cube, cube === attnResidual ? 'residual-add-1' : 'attention-mix'),
  )

  y = attnResidual.y + attnResidual.dy + margin * 2

  const ln2 = createRmsNorm(attnResidual, 'norm-2', 'rmsnorm 2')

  const mlpFcWeight = mk({
    t: 'w',
    xR: projLeft,
    zM: 0,
    y,
    cx: shape.C,
    cy: shape.C * 4,
    name: 'fc1',
    dimX: DimStyle.C,
    dimY: DimStyle.C4,
  })
  mlpFcWeight.access = createAccess([1, 0, 0], [0, 1, 0], shape.C * 0.5)
  const mlpFcBias = mk({
    t: 'w',
    xR: projLeft - shape.C * cell - margin,
    zM: 0,
    y,
    cx: 1,
    cy: shape.C * 4,
    name: '',
    hidden: true,
    small: true,
  })
  mlpFcBias.access = createAccess([1, 0, 0], [0, 0, 0], shape.C * 0.5)
  const mlpFc = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.C * 4,
    cy: shape.T,
    cz: shape.B,
    dimX: DimStyle.C4,
    dimY: DimStyle.T,
    name: 'fc1 output',
  })
  mlpFc.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  mlpFc.deps = makeDeps({
    dot: [[mlpFcWeight, 'xi'], [ln2.lnResid, 'yi']],
    add: [[mlpFcBias, 'x0']],
    dotLen: shape.C,
    special: BlKDepSpecial.None,
  })
  registerCube(mlpFcWeight, 'mlp')
  registerCube(mlpFcBias, 'mlp')
  registerCube(mlpFc, 'mlp')

  y += shape.T * cell + margin

  const mlpAct = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.C * 4,
    cy: shape.T,
    cz: shape.B,
    dimX: DimStyle.C4,
    dimY: DimStyle.T,
    name: 'relu',
  })
  mlpAct.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  mlpAct.deps = makeDeps({
    add: [[mlpFc, 'xy']],
    special: BlKDepSpecial.Gelu,
  })
  registerCube(mlpAct, 'mlp')

  y += shape.T * cell + margin

  const mlpProjWeight = mk({
    t: 'w',
    xR: projLeft,
    zM: 0,
    y,
    cx: shape.C * 4,
    cy: shape.C,
    name: 'fc2',
    dimX: DimStyle.C4,
    dimY: DimStyle.C,
  })
  mlpProjWeight.access = createAccess([1, 0, 0], [0, 1, 0], shape.C * 0.5)
  const mlpProjBias = mk({
    t: 'w',
    xR: projLeft - shape.C * 4 * cell - margin,
    zM: 0,
    y,
    cx: 1,
    cy: shape.C,
    name: '',
    hidden: true,
    small: true,
  })
  mlpProjBias.access = createAccess([0, 0, 0], [0, 1, 0], shape.C * 0.5)
  const mlpResult = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: shape.C,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.C,
    name: 'mlp result',
  })
  mlpResult.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  mlpResult.deps = makeDeps({
    dot: [[mlpProjWeight, 'iy'], [mlpAct, 'ix']],
    add: [[mlpProjBias, '0y']],
    dotLen: shape.C,
    special: BlKDepSpecial.None,
  })
  const mlpResidual = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: shape.C,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.C,
    name: 'mlp residual',
  })
  mlpResidual.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  mlpResidual.deps = makeDeps({
    add: [[mlpResult, 'xy'], [attnResidual, 'xy']],
    special: BlKDepSpecial.None,
  })
  ;[mlpProjWeight, mlpProjBias, mlpResult, mlpResidual].forEach((cube) =>
    registerCube(cube, cube === mlpResult || cube === mlpResidual ? 'mlp' : 'mlp'),
  )

  const transformerCubes = [
    ...ln1.cubes,
    ...heads.flatMap((head) => head.cubes),
    projWeight,
    projBias,
    attnOut,
    attnResidual,
    ...ln2.cubes,
    mlpFcWeight,
    mlpFcBias,
    mlpFc,
    mlpAct,
    mlpProjWeight,
    mlpProjBias,
    mlpResult,
    mlpResidual,
  ]
  const projLabel = mkLabel(0.72, [projWeight, attnOut, attnResidual])
  const selfAttendLabel = mkLabel(0.82, [
    ...ln1.cubes,
    ...heads.flatMap((head) => head.cubes),
    ...[projWeight, attnOut, attnResidual],
  ])
  const mlpLabel = mkLabel(0.82, [
    ...ln2.cubes,
    mlpFcWeight,
    mlpFc,
    mlpAct,
    mlpProjWeight,
    mlpResult,
    mlpResidual,
  ])
  const transformerLabel = mkLabel(0.95, transformerCubes)

  y += shape.C * cell + margin * 2

  const lmHeadWeight = mk({
    t: 'w',
    xR: leftX - shape.T * cell - margin,
    zM: 0,
    y,
    cx: shape.C,
    cy: shape.vocabSize,
    name: 'lm head',
    dimX: DimStyle.C,
    dimY: DimStyle.n_vocab,
  })
  lmHeadWeight.access = createAccess([1, 0, 0], [0, 1, 0], 5)
  const logits = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: shape.vocabSize,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.n_vocab,
    name: 'logits',
  })
  logits.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  logits.deps = makeDeps({
    dot: [[lmHeadWeight, 'iy'], [mlpResidual, 'xi']],
    dotLen: shape.C,
    special: BlKDepSpecial.None,
  })
  registerCube(lmHeadWeight, 'logits')
  registerCube(logits, 'logits')

  y += shape.vocabSize * cell + margin

  const logitsAgg2 = mk({
    t: 'a',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: 1,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.None,
    name: 'softmax max',
    small: true,
  })
  logitsAgg2.access = createAccess([1, 0, 0], [0, 0, 0], 1)
  logitsAgg2.deps = makeDeps({
    add: [[logits, 'xi']],
    special: BlKDepSpecial.SoftmaxAggMax,
  })
  const logitsAgg1 = mk({
    t: 'a',
    xM: 0,
    zM: 0,
    y: y + cell,
    cx: shape.T,
    cy: 1,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.None,
    name: 'softmax exp',
    small: true,
  })
  logitsAgg1.access = createAccess([1, 0, 0], [0, 0, 0], 1)
  logitsAgg1.deps = makeDeps({
    add: [[logits, 'xi'], [logitsAgg2, 'x0']],
    special: BlKDepSpecial.SoftmaxAggExp,
  })
  registerCube(logitsAgg2, 'probabilities')
  registerCube(logitsAgg1, 'probabilities')

  y += 2 * cell + margin

  const logitsSoftmax = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: shape.vocabSize,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.n_vocab,
    name: 'probabilities',
  })
  logitsSoftmax.access = createAccess([1, 0, 0], [0, 1, 0], 1)
  logitsSoftmax.deps = makeDeps({
    add: [[logits, 'xy'], [logitsAgg1, 'x0'], [logitsAgg2, 'x0']],
    special: BlKDepSpecial.Softmax,
  })
  registerCube(logitsSoftmax, 'probabilities')

  y += shape.vocabSize * cell + margin

  const sampleBlock = mk({
    t: 'i',
    xM: 0,
    zM: 0,
    y,
    cx: shape.T,
    cy: 1,
    cz: shape.B,
    dimX: DimStyle.T,
    dimY: DimStyle.None,
    name: 'sample / stop',
  })
  sampleBlock.access = createAccess([1, 0, 0], [0, 0, 0], 1)
  registerCube(sampleBlock, 'sample')
  const outputLabel = mkLabel(0.9, [
    lmHeadWeight,
    logits,
    logitsAgg1,
    logitsAgg2,
    logitsSoftmax,
    sampleBlock,
  ])

  const transformerBlock: MicroVizTransformerBlock = {
    ln1,
    heads,
    cubes: transformerCubes,
    labels: [
      transformerLabel,
      projLabel,
      selfAttendLabel,
      mlpLabel,
      ...heads.flatMap((head) => head.labels),
    ],
    transformerLabel,
    projLabel,
    selfAttendLabel,
    mlpLabel,
    projWeight,
    projBias,
    attnOut,
    attnResidual,
    ln2,
    mlpFcWeight,
    mlpFcBias,
    mlpFc,
    mlpAct,
    mlpProjWeight,
    mlpProjBias,
    mlpResult,
    mlpResidual,
  }

  const blockMap = {
    context: makeBlock('context', idxObj, 'context'),
    'token-embedding': makeBlock('token-embedding', tokEmbedObj, 'token-embedding'),
    'position-embedding': makeBlock(
      'position-embedding',
      posEmbedObj,
      'position-embedding',
    ),
    'residual-stream': makeBlock('residual-stream', residual0, 'residual-stream'),
    'norm-1': makeBlock('norm-1', ln1.lnResid, 'norm-1'),
    'q-project': makeBlock('q-project', heads[0]!.qWeightBlock, 'qkv'),
    'k-project': makeBlock('k-project', heads[0]!.kWeightBlock, 'qkv'),
    'v-project': makeBlock('v-project', heads[0]!.vWeightBlock, 'qkv'),
    'attention-head-1': makeBlock(
      'attention-head-1',
      heads[0]!.attnMtxSm,
      'attention-head-1',
    ),
    'attention-head-2': makeBlock(
      'attention-head-2',
      heads[1]!.attnMtxSm,
      'attention-head-2',
    ),
    'attention-head-3': makeBlock(
      'attention-head-3',
      heads[2]!.attnMtxSm,
      'attention-head-3',
    ),
    'attention-head-4': makeBlock(
      'attention-head-4',
      heads[3]!.attnMtxSm,
      'attention-head-4',
    ),
    'attention-out': makeBlock('attention-out', attnOut, 'attention-mix'),
    'residual-add-1': makeBlock('residual-add-1', attnResidual, 'residual-add-1'),
    'norm-2': makeBlock('norm-2', ln2.lnResid, 'norm-2'),
    'mlp-fc1': makeBlock('mlp-fc1', mlpFcWeight, 'mlp'),
    'mlp-relu': makeBlock('mlp-relu', mlpAct, 'mlp'),
    'mlp-fc2': makeBlock('mlp-fc2', mlpProjWeight, 'mlp'),
    logits: makeBlock('logits', logits, 'logits'),
    probabilities: makeBlock('probabilities', logitsSoftmax, 'probabilities'),
    sample: makeBlock('sample', sampleBlock, 'sample'),
  } satisfies Record<MicroVizBlockId, MicroVizBlock>

  const edges = [
    makeEdge(
      'context-to-token-embedding',
      'context',
      'token-embedding',
      'context-to-token-embedding',
    ),
    makeEdge(
      'context-to-position-embedding',
      'context',
      'position-embedding',
      'context-to-position-embedding',
    ),
    makeEdge(
      'token-embedding-to-residual-stream',
      'token-embedding',
      'residual-stream',
      'token-embedding-to-residual-stream',
    ),
    makeEdge(
      'position-embedding-to-residual-stream',
      'position-embedding',
      'residual-stream',
      'position-embedding-to-residual-stream',
    ),
    makeEdge(
      'residual-stream-to-norm-1',
      'residual-stream',
      'norm-1',
      'residual-stream-to-norm-1',
    ),
    makeEdge('norm-1-to-q-project', 'norm-1', 'q-project', 'norm-1-to-qkv'),
    makeEdge('norm-1-to-k-project', 'norm-1', 'k-project', 'norm-1-to-qkv'),
    makeEdge('norm-1-to-v-project', 'norm-1', 'v-project', 'norm-1-to-qkv'),
    makeEdge(
      'q-project-to-attention-head-1',
      'q-project',
      'attention-head-1',
      'qkv-to-attention-head-1',
    ),
    makeEdge(
      'q-project-to-attention-head-2',
      'q-project',
      'attention-head-2',
      'qkv-to-attention-head-2',
    ),
    makeEdge(
      'q-project-to-attention-head-3',
      'q-project',
      'attention-head-3',
      'qkv-to-attention-head-3',
    ),
    makeEdge(
      'q-project-to-attention-head-4',
      'q-project',
      'attention-head-4',
      'qkv-to-attention-head-4',
    ),
    makeEdge(
      'k-project-to-attention-head-1',
      'k-project',
      'attention-head-1',
      'qkv-to-attention-head-1',
    ),
    makeEdge(
      'k-project-to-attention-head-2',
      'k-project',
      'attention-head-2',
      'qkv-to-attention-head-2',
    ),
    makeEdge(
      'k-project-to-attention-head-3',
      'k-project',
      'attention-head-3',
      'qkv-to-attention-head-3',
    ),
    makeEdge(
      'k-project-to-attention-head-4',
      'k-project',
      'attention-head-4',
      'qkv-to-attention-head-4',
    ),
    makeEdge(
      'v-project-to-attention-head-1',
      'v-project',
      'attention-head-1',
      'qkv-to-attention-head-1',
    ),
    makeEdge(
      'v-project-to-attention-head-2',
      'v-project',
      'attention-head-2',
      'qkv-to-attention-head-2',
    ),
    makeEdge(
      'v-project-to-attention-head-3',
      'v-project',
      'attention-head-3',
      'qkv-to-attention-head-3',
    ),
    makeEdge(
      'v-project-to-attention-head-4',
      'v-project',
      'attention-head-4',
      'qkv-to-attention-head-4',
    ),
    makeEdge(
      'attention-head-1-to-attention-out',
      'attention-head-1',
      'attention-out',
      'attention-head-1-to-attention-mix',
    ),
    makeEdge(
      'attention-head-2-to-attention-out',
      'attention-head-2',
      'attention-out',
      'attention-head-2-to-attention-mix',
    ),
    makeEdge(
      'attention-head-3-to-attention-out',
      'attention-head-3',
      'attention-out',
      'attention-head-3-to-attention-mix',
    ),
    makeEdge(
      'attention-head-4-to-attention-out',
      'attention-head-4',
      'attention-out',
      'attention-head-4-to-attention-mix',
    ),
    makeEdge(
      'attention-out-to-residual-add-1',
      'attention-out',
      'residual-add-1',
      'attention-mix-to-residual-add-1',
    ),
    makeEdge(
      'residual-add-1-to-norm-2',
      'residual-add-1',
      'norm-2',
      'residual-add-1-to-norm-2',
    ),
    makeEdge('norm-2-to-mlp-fc1', 'norm-2', 'mlp-fc1', 'norm-2-to-mlp'),
    makeEdge('mlp-fc1-to-mlp-relu', 'mlp-fc1', 'mlp-relu', 'norm-2-to-mlp'),
    makeEdge('mlp-relu-to-mlp-fc2', 'mlp-relu', 'mlp-fc2', 'norm-2-to-mlp'),
    makeEdge('mlp-fc2-to-logits', 'mlp-fc2', 'logits', 'mlp-to-logits'),
    makeEdge(
      'logits-to-probabilities',
      'logits',
      'probabilities',
      'logits-to-probabilities',
    ),
    makeEdge(
      'probabilities-to-sample',
      'probabilities',
      'sample',
      'probabilities-to-sample',
    ),
  ] satisfies MicroVizEdge[]

  const height = sampleBlock.y + sampleBlock.dy + margin * 6
  const bounds = cubes.reduce(
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
  const centerY = (bounds.minY + bounds.maxY) * 0.5
  const centerZ = (bounds.minZ + bounds.maxZ) * 0.5
  const cameraPoses = {
    overview: {
      center: new Vec3(centerX - 6, centerY + 18, centerZ),
      angle: new Vec3(288, 17, 11.2),
    },
    input: {
      center: new Vec3(centerX, centerY, centerZ),
      angle: new Vec3(288, 17, 10.5),
    },
    attention: {
      center: new Vec3(centerX + 28, centerY + 32, centerZ + 6),
      angle: new Vec3(287, 18, 10.8),
    },
    residual: {
      center: new Vec3(centerX + 16, centerY + 84, centerZ),
      angle: new Vec3(288, 17, 10.6),
    },
    readout: {
      center: new Vec3(centerX + 22, centerY + 116, centerZ + 2),
      angle: new Vec3(287, 17, 10.2),
    },
    sample: {
      center: new Vec3(centerX + 28, centerY + 148, centerZ + 4),
      angle: new Vec3(287, 16, 9.9),
    },
  }

  return {
    cubes,
    labels: [embedLabel, ...transformerBlock.labels, outputLabel],
    blocks: [transformerBlock],
    blockMap,
    cubeFocusIds,
    edges,
    shape,
    weightCount: countParams(model),
    cameraPoses,
    cell,
    margin,
    height,
    idxObj,
    tokEmbedObj,
    posEmbedObj,
    residual0,
    ln_f: null,
    embedLabel,
    transformerBlocks: [transformerBlock],
    outputLabel,
    lmHeadWeight,
    logits,
    logitsAgg1,
    logitsAgg2,
    logitsSoftmax,
    sampleBlock,
    logitsTransposed: false,
    model: {
      inputTokens: { localBuffer: new Float32Array(shape.T) },
      inputLen: 0,
      sortedBuf: new Float32Array(shape.T * shape.vocabSize * 2),
    },
  }
}
