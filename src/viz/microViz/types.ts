import type { TokenStepTrace } from '../../model'
import type { PhaseDefinition } from '../../walkthrough/phases'
import type { ICamera, ICameraPos } from '../../vendor/llmVizOriginal/llm/Camera'
import type {
  BlKDepSpecial,
  IBlkDef,
  IBlkLabel,
} from '../../vendor/llmVizOriginal/llm/GptModelLayout'
import type { DimStyle } from '../../vendor/llmVizOriginal/llm/walkthrough/WalkthroughTools'
import type { IRenderState } from '../../vendor/llmVizOriginal/llm/render/modelRender'
import type { IBufferTex } from '../../vendor/llmVizOriginal/utils/renderPhases'
import type {
  CameraPoseId,
  SceneModelData,
  VizEdgeId,
  VizFrame,
  VizNodeId,
} from '../llmViz/types'

export type MicroVizBlockId =
  | 'context'
  | 'token-embedding'
  | 'position-embedding'
  | 'residual-stream'
  | 'norm-1'
  | 'q-project'
  | 'k-project'
  | 'v-project'
  | 'attention-head-1'
  | 'attention-head-2'
  | 'attention-head-3'
  | 'attention-head-4'
  | 'attention-out'
  | 'residual-add-1'
  | 'norm-2'
  | 'mlp-fc1'
  | 'mlp-relu'
  | 'mlp-fc2'
  | 'logits'
  | 'probabilities'
  | 'sample'

export type MicroVizEdgeId =
  | 'context-to-token-embedding'
  | 'context-to-position-embedding'
  | 'token-embedding-to-residual-stream'
  | 'position-embedding-to-residual-stream'
  | 'residual-stream-to-norm-1'
  | 'norm-1-to-q-project'
  | 'norm-1-to-k-project'
  | 'norm-1-to-v-project'
  | 'q-project-to-attention-head-1'
  | 'q-project-to-attention-head-2'
  | 'q-project-to-attention-head-3'
  | 'q-project-to-attention-head-4'
  | 'k-project-to-attention-head-1'
  | 'k-project-to-attention-head-2'
  | 'k-project-to-attention-head-3'
  | 'k-project-to-attention-head-4'
  | 'v-project-to-attention-head-1'
  | 'v-project-to-attention-head-2'
  | 'v-project-to-attention-head-3'
  | 'v-project-to-attention-head-4'
  | 'attention-head-1-to-attention-out'
  | 'attention-head-2-to-attention-out'
  | 'attention-head-3-to-attention-out'
  | 'attention-head-4-to-attention-out'
  | 'attention-out-to-residual-add-1'
  | 'residual-add-1-to-norm-2'
  | 'norm-2-to-mlp-fc1'
  | 'mlp-fc1-to-mlp-relu'
  | 'mlp-relu-to-mlp-fc2'
  | 'mlp-fc2-to-logits'
  | 'logits-to-probabilities'
  | 'probabilities-to-sample'

export interface MicroVizShape {
  B: number
  T: number
  C: number
  A: number
  nHeads: number
  nBlocks: number
  vocabSize: number
}

export interface MicroVizBlock {
  id: MicroVizBlockId
  cube: IBlkDef
  codeFocusId: VizNodeId | VizEdgeId | null
}

export interface MicroVizEdge {
  id: MicroVizEdgeId
  from: MicroVizBlockId
  to: MicroVizBlockId
  codeFocusId: VizEdgeId | VizNodeId | null
}

export interface MicroVizNormGroup {
  lnAgg1: IBlkDef
  lnAgg2: IBlkDef
  lnSigma: IBlkDef
  lnMu: IBlkDef
  lnResid: IBlkDef
  cubes: IBlkDef[]
}

export interface MicroVizHeadGroup {
  qWeightBlock: IBlkDef
  kWeightBlock: IBlkDef
  vWeightBlock: IBlkDef
  qBiasBlock: IBlkDef
  kBiasBlock: IBlkDef
  vBiasBlock: IBlkDef
  qBlock: IBlkDef
  kBlock: IBlkDef
  vBlock: IBlkDef
  attnMtx: IBlkDef
  attnMtxAgg1: IBlkDef
  attnMtxAgg2: IBlkDef
  attnMtxSm: IBlkDef
  vOutBlock: IBlkDef
  qLabel: IBlkLabel
  kLabel: IBlkLabel
  vLabel: IBlkLabel
  biasLabel: IBlkLabel
  mtxLabel: IBlkLabel
  vectorLabel: IBlkLabel
  headLabel: IBlkLabel
  cubes: IBlkDef[]
  labels: IBlkLabel[]
}

export interface MicroVizTransformerBlock {
  ln1: MicroVizNormGroup
  heads: MicroVizHeadGroup[]
  cubes: IBlkDef[]
  labels: IBlkLabel[]
  transformerLabel: IBlkLabel
  projLabel: IBlkLabel
  selfAttendLabel: IBlkLabel
  mlpLabel: IBlkLabel
  projWeight: IBlkDef
  projBias: IBlkDef
  attnOut: IBlkDef
  attnResidual: IBlkDef
  ln2: MicroVizNormGroup
  mlpFcWeight: IBlkDef
  mlpFcBias: IBlkDef
  mlpFc: IBlkDef
  mlpAct: IBlkDef
  mlpProjWeight: IBlkDef
  mlpProjBias: IBlkDef
  mlpResult: IBlkDef
  mlpResidual: IBlkDef
}

export interface MicroVizCardModel {
  inputTokens: {
    localBuffer: Float32Array
  }
  inputLen: number
  sortedBuf: Float32Array
}

export interface MicroVizLayout {
  cubes: IBlkDef[]
  labels: IBlkLabel[]
  blocks: MicroVizTransformerBlock[]
  blockMap: Record<MicroVizBlockId, MicroVizBlock>
  cubeFocusIds: Record<number, VizNodeId | VizEdgeId | null>
  edges: MicroVizEdge[]
  shape: MicroVizShape
  weightCount: number
  cameraPoses: Record<CameraPoseId, ICameraPos>
  cell: number
  margin: number
  height: number
  idxObj: IBlkDef
  tokEmbedObj: IBlkDef
  posEmbedObj: IBlkDef
  residual0: IBlkDef
  ln_f: MicroVizNormGroup | null
  embedLabel: IBlkLabel
  transformerBlocks: MicroVizTransformerBlock[]
  outputLabel: IBlkLabel
  lmHeadWeight: IBlkDef
  logits: IBlkDef
  logitsAgg1: IBlkDef
  logitsAgg2: IBlkDef
  logitsSoftmax: IBlkDef
  sampleBlock: IBlkDef
  logitsTransposed: boolean
  model: MicroVizCardModel
}

export type MicroVizStaticModel = SceneModelData

export interface MicroVizDynamicFrame {
  trace: TokenStepTrace
  contextTokens: string[]
  vizFrame: VizFrame
}

export interface MicroVizTextureBinding {
  kind: 'static' | 'dynamic'
  key: string
}

export interface MicroVizPhaseState {
  phaseId: PhaseDefinition['id']
  cameraPoseId: CameraPoseId
  cameraTarget: ICameraPos
  focusBlockIds: MicroVizBlockId[]
  emphasisBlockIds: MicroVizBlockId[]
  emphasisEdgeIds: MicroVizEdgeId[]
  hoverBlockIndices: number[]
  dimHover: DimStyle | null
  lines: string[]
  topOutputOpacity?: number
  opacityByBlockId: Partial<Record<MicroVizBlockId, number>>
  highlightByBlockId: Partial<Record<MicroVizBlockId, number>>
  blockBindings: Partial<Record<MicroVizBlockId, MicroVizTextureBinding>>
  specials: Partial<Record<MicroVizBlockId, BlKDepSpecial>>
}

export interface MicroVizTextureSet {
  staticTextures: Record<string, IBufferTex>
  dynamicTextures: Record<string, IBufferTex>
  scales: Record<string, number>
}

export interface MicroVizRenderContext {
  renderState: IRenderState
  camera: ICamera
  layout: MicroVizLayout
  textures: MicroVizTextureSet
}
