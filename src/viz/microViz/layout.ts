import type { SceneModelData, VizEdgeId, VizNodeId } from '../llmViz/types'
import type {
  MicroVizBlock,
  MicroVizBlockId,
  MicroVizEdge,
  MicroVizEdgeId,
  MicroVizLayout,
  MicroVizShape,
} from './types'
import { Mat4f } from '../../vendor/llmVizOriginal/utils/matrix'
import { Vec3 } from '../../vendor/llmVizOriginal/utils/vector'
import {
  BlkSpecial,
  type IBlkAccess,
  type IBlkDef,
  type IBlkLabel,
} from '../../vendor/llmVizOriginal/llm/GptModelLayout'
import { DimStyle } from '../../vendor/llmVizOriginal/llm/walkthrough/WalkthroughTools'

const defaultDepth = 16
const headWidth = 58
const headHeight = 46

function makeAccessMatrix(x: number[], y: number[]) {
  const x4 = x.length === 4 ? x : [...x, 0]
  const y4 = y.length === 4 ? y : [...y, 0]
  return Mat4f.fromColMajor([...x4, ...y4, 0, 0, 0, 0, 0, 0, 0, 0])
}

function createAccess(): IBlkAccess {
  return {
    src: null as never,
    channel: 'r',
    scale: 1,
    mat: makeAccessMatrix([1, 0, 0, 0], [0, 1, 0, 0]),
    disable: true,
  }
}

function makeCube(args: {
  t: 'w' | 'i' | 'a'
  x: number
  y: number
  z?: number
  dx: number
  dy: number
  dz?: number
  cx: number
  cy: number
  cz?: number
  name: string
}) {
  const cube: IBlkDef = {
    idx: -1,
    t: args.t,
    x: args.x,
    y: args.y,
    z: args.z ?? -((args.dz ?? defaultDepth) / 2),
    dx: args.dx,
    dy: args.dy,
    dz: args.dz ?? defaultDepth,
    cx: args.cx,
    cy: args.cy,
    cz: args.cz ?? 1,
    dimX: args.t === 'w' ? DimStyle.Weights : DimStyle.Intermediates,
    dimY: args.t === 'w' ? DimStyle.Weights : DimStyle.Intermediates,
    name: args.name,
    access: createAccess(),
    opacity: 1,
    highlight: 0,
    small: false,
    special: BlkSpecial.None,
    localMtx: Mat4f.identity,
  }

  return cube
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

function countParams(model: SceneModelData) {
  return Object.values(model.weights).reduce(
    (total, matrix) => total + matrix.rows * matrix.cols,
    0,
  )
}

export function buildMicroVizLayout(model: SceneModelData): MicroVizLayout {
  const blocks = {
    context: makeBlock(
      'context',
      makeCube({
        t: 'a',
        x: -88,
        y: 36,
        dx: 176,
        dy: 22,
        dz: 12,
        cx: model.config.blockSize,
        cy: 1,
        name: 'context',
      }),
      'context',
    ),
    'token-embedding': makeBlock(
      'token-embedding',
      makeCube({
        t: 'w',
        x: -112,
        y: 96,
        dx: 74,
        dy: 88,
        cx: model.weights.wte.cols,
        cy: model.weights.wte.rows,
        name: 'token embed',
      }),
      'token-embedding',
    ),
    'position-embedding': makeBlock(
      'position-embedding',
      makeCube({
        t: 'w',
        x: 40,
        y: 96,
        dx: 74,
        dy: 72,
        cx: model.weights.wpe.cols,
        cy: model.weights.wpe.rows,
        name: 'position embed',
      }),
      'position-embedding',
    ),
    'residual-stream': makeBlock(
      'residual-stream',
      makeCube({
        t: 'i',
        x: -58,
        y: 214,
        dx: 116,
        dy: 24,
        cx: model.config.nEmbd,
        cy: 1,
        name: 'residual',
      }),
      'residual-stream',
    ),
    'norm-1': makeBlock(
      'norm-1',
      makeCube({
        t: 'i',
        x: -46,
        y: 270,
        dx: 92,
        dy: 22,
        cx: model.config.nEmbd,
        cy: 1,
        name: 'rmsnorm 1',
      }),
      'norm-1',
    ),
    'q-project': makeBlock(
      'q-project',
      makeCube({
        t: 'w',
        x: -142,
        y: 334,
        dx: 72,
        dy: 72,
        cx: model.weights['layer0.attn_wq'].cols,
        cy: model.weights['layer0.attn_wq'].rows,
        name: 'Wq',
      }),
      'qkv',
    ),
    'k-project': makeBlock(
      'k-project',
      makeCube({
        t: 'w',
        x: -36,
        y: 334,
        dx: 72,
        dy: 72,
        cx: model.weights['layer0.attn_wk'].cols,
        cy: model.weights['layer0.attn_wk'].rows,
        name: 'Wk',
      }),
      'qkv',
    ),
    'v-project': makeBlock(
      'v-project',
      makeCube({
        t: 'w',
        x: 70,
        y: 334,
        dx: 72,
        dy: 72,
        cx: model.weights['layer0.attn_wv'].cols,
        cy: model.weights['layer0.attn_wv'].rows,
        name: 'Wv',
      }),
      'qkv',
    ),
    'attention-head-1': makeBlock(
      'attention-head-1',
      makeCube({
        t: 'i',
        x: -160,
        y: 444,
        dx: headWidth,
        dy: headHeight,
        cx: model.config.blockSize,
        cy: model.config.headDim,
        name: 'head 1',
      }),
      'attention-head-1',
    ),
    'attention-head-2': makeBlock(
      'attention-head-2',
      makeCube({
        t: 'i',
        x: -72,
        y: 444,
        dx: headWidth,
        dy: headHeight,
        cx: model.config.blockSize,
        cy: model.config.headDim,
        name: 'head 2',
      }),
      'attention-head-2',
    ),
    'attention-head-3': makeBlock(
      'attention-head-3',
      makeCube({
        t: 'i',
        x: 16,
        y: 444,
        dx: headWidth,
        dy: headHeight,
        cx: model.config.blockSize,
        cy: model.config.headDim,
        name: 'head 3',
      }),
      'attention-head-3',
    ),
    'attention-head-4': makeBlock(
      'attention-head-4',
      makeCube({
        t: 'i',
        x: 104,
        y: 444,
        dx: headWidth,
        dy: headHeight,
        cx: model.config.blockSize,
        cy: model.config.headDim,
        name: 'head 4',
      }),
      'attention-head-4',
    ),
    'attention-out': makeBlock(
      'attention-out',
      makeCube({
        t: 'w',
        x: -58,
        y: 548,
        dx: 116,
        dy: 72,
        cx: model.weights['layer0.attn_wo'].cols,
        cy: model.weights['layer0.attn_wo'].rows,
        name: 'Wo',
      }),
      'attention-mix',
    ),
    'residual-add-1': makeBlock(
      'residual-add-1',
      makeCube({
        t: 'i',
        x: -58,
        y: 646,
        dx: 116,
        dy: 24,
        cx: model.config.nEmbd,
        cy: 1,
        name: 'residual add',
      }),
      'residual-add-1',
    ),
    'norm-2': makeBlock(
      'norm-2',
      makeCube({
        t: 'i',
        x: -46,
        y: 702,
        dx: 92,
        dy: 22,
        cx: model.config.nEmbd,
        cy: 1,
        name: 'rmsnorm 2',
      }),
      'norm-2',
    ),
    'mlp-fc1': makeBlock(
      'mlp-fc1',
      makeCube({
        t: 'w',
        x: -138,
        y: 768,
        dx: 94,
        dy: 136,
        cx: model.weights['layer0.mlp_fc1'].cols,
        cy: model.weights['layer0.mlp_fc1'].rows,
        name: 'fc1',
      }),
      'mlp',
    ),
    'mlp-relu': makeBlock(
      'mlp-relu',
      makeCube({
        t: 'i',
        x: -22,
        y: 802,
        dx: 52,
        dy: 96,
        cx: 8,
        cy: 8,
        name: 'relu',
      }),
      'mlp',
    ),
    'mlp-fc2': makeBlock(
      'mlp-fc2',
      makeCube({
        t: 'w',
        x: 52,
        y: 802,
        dx: 118,
        dy: 72,
        cx: model.weights['layer0.mlp_fc2'].cols,
        cy: model.weights['layer0.mlp_fc2'].rows,
        name: 'fc2',
      }),
      'mlp',
    ),
    logits: makeBlock(
      'logits',
      makeCube({
        t: 'w',
        x: -58,
        y: 958,
        dx: 116,
        dy: 84,
        cx: model.weights.lm_head.cols,
        cy: model.weights.lm_head.rows,
        name: 'lm head',
      }),
      'logits',
    ),
    probabilities: makeBlock(
      'probabilities',
      makeCube({
        t: 'i',
        x: -58,
        y: 1076,
        dx: 116,
        dy: 24,
        cx: model.config.vocabSize,
        cy: 1,
        name: 'probabilities',
      }),
      'probabilities',
    ),
    sample: makeBlock(
      'sample',
      makeCube({
        t: 'i',
        x: -58,
        y: 1134,
        dx: 116,
        dy: 22,
        cx: model.config.vocabSize,
        cy: 1,
        name: 'sample / stop',
      }),
      'sample',
    ),
  } satisfies Record<MicroVizBlockId, MicroVizBlock>

  const edges = [
    makeEdge('context-to-token-embedding', 'context', 'token-embedding', 'context-to-token-embedding'),
    makeEdge('context-to-position-embedding', 'context', 'position-embedding', 'context-to-position-embedding'),
    makeEdge('token-embedding-to-residual-stream', 'token-embedding', 'residual-stream', 'token-embedding-to-residual-stream'),
    makeEdge('position-embedding-to-residual-stream', 'position-embedding', 'residual-stream', 'position-embedding-to-residual-stream'),
    makeEdge('residual-stream-to-norm-1', 'residual-stream', 'norm-1', 'residual-stream-to-norm-1'),
    makeEdge('norm-1-to-q-project', 'norm-1', 'q-project', 'norm-1-to-qkv'),
    makeEdge('norm-1-to-k-project', 'norm-1', 'k-project', 'norm-1-to-qkv'),
    makeEdge('norm-1-to-v-project', 'norm-1', 'v-project', 'norm-1-to-qkv'),
    makeEdge('q-project-to-attention-head-1', 'q-project', 'attention-head-1', 'qkv-to-attention-head-1'),
    makeEdge('q-project-to-attention-head-2', 'q-project', 'attention-head-2', 'qkv-to-attention-head-2'),
    makeEdge('q-project-to-attention-head-3', 'q-project', 'attention-head-3', 'qkv-to-attention-head-3'),
    makeEdge('q-project-to-attention-head-4', 'q-project', 'attention-head-4', 'qkv-to-attention-head-4'),
    makeEdge('k-project-to-attention-head-1', 'k-project', 'attention-head-1', 'qkv-to-attention-head-1'),
    makeEdge('k-project-to-attention-head-2', 'k-project', 'attention-head-2', 'qkv-to-attention-head-2'),
    makeEdge('k-project-to-attention-head-3', 'k-project', 'attention-head-3', 'qkv-to-attention-head-3'),
    makeEdge('k-project-to-attention-head-4', 'k-project', 'attention-head-4', 'qkv-to-attention-head-4'),
    makeEdge('v-project-to-attention-head-1', 'v-project', 'attention-head-1', 'qkv-to-attention-head-1'),
    makeEdge('v-project-to-attention-head-2', 'v-project', 'attention-head-2', 'qkv-to-attention-head-2'),
    makeEdge('v-project-to-attention-head-3', 'v-project', 'attention-head-3', 'qkv-to-attention-head-3'),
    makeEdge('v-project-to-attention-head-4', 'v-project', 'attention-head-4', 'qkv-to-attention-head-4'),
    makeEdge('attention-head-1-to-attention-out', 'attention-head-1', 'attention-out', 'attention-head-1-to-attention-mix'),
    makeEdge('attention-head-2-to-attention-out', 'attention-head-2', 'attention-out', 'attention-head-2-to-attention-mix'),
    makeEdge('attention-head-3-to-attention-out', 'attention-head-3', 'attention-out', 'attention-head-3-to-attention-mix'),
    makeEdge('attention-head-4-to-attention-out', 'attention-head-4', 'attention-out', 'attention-head-4-to-attention-mix'),
    makeEdge('attention-out-to-residual-add-1', 'attention-out', 'residual-add-1', 'attention-mix-to-residual-add-1'),
    makeEdge('residual-add-1-to-norm-2', 'residual-add-1', 'norm-2', 'residual-add-1-to-norm-2'),
    makeEdge('norm-2-to-mlp-fc1', 'norm-2', 'mlp-fc1', 'norm-2-to-mlp'),
    makeEdge('mlp-fc1-to-mlp-relu', 'mlp-fc1', 'mlp-relu', 'norm-2-to-mlp'),
    makeEdge('mlp-relu-to-mlp-fc2', 'mlp-relu', 'mlp-fc2', 'norm-2-to-mlp'),
    makeEdge('mlp-fc2-to-logits', 'mlp-fc2', 'logits', 'mlp-to-logits'),
    makeEdge('logits-to-probabilities', 'logits', 'probabilities', 'logits-to-probabilities'),
    makeEdge('probabilities-to-sample', 'probabilities', 'sample', 'probabilities-to-sample'),
  ]

  const cubes = Object.values(blocks).map((block, index) => {
    block.cube.idx = index
    return block.cube
  })
  const labels: IBlkLabel[] = []

  const shape: MicroVizShape = {
    B: 1,
    T: model.config.blockSize,
    C: model.config.nEmbd,
    A: model.config.headDim,
    nHeads: model.config.nHead,
    nBlocks: model.config.nLayer,
    vocabSize: model.config.vocabSize,
  }

  return {
    cubes,
    labels,
    blocks,
    edges,
    shape,
    weightCount: countParams(model),
    cameraPoses: {
      overview: {
        center: new Vec3(0, 610, 0),
        angle: new Vec3(292, 16, 7.1),
      },
      input: {
        center: new Vec3(0, 210, 0),
        angle: new Vec3(292, 16, 5.4),
      },
      attention: {
        center: new Vec3(0, 500, 0),
        angle: new Vec3(292, 16, 5.1),
      },
      residual: {
        center: new Vec3(0, 760, 0),
        angle: new Vec3(292, 16, 4.8),
      },
      readout: {
        center: new Vec3(0, 1010, 0),
        angle: new Vec3(292, 16, 4.5),
      },
      sample: {
        center: new Vec3(0, 1125, 0),
        angle: new Vec3(292, 16, 4.2),
      },
    },
  }
}
