import type { MatrixData, ModelConfig } from '../../model'

export type VizNodeId =
  | 'context'
  | 'token-embedding'
  | 'position-embedding'
  | 'residual-stream'
  | 'norm-1'
  | 'qkv'
  | 'attention-head-1'
  | 'attention-head-2'
  | 'attention-head-3'
  | 'attention-head-4'
  | 'attention-mix'
  | 'residual-add-1'
  | 'norm-2'
  | 'mlp'
  | 'logits'
  | 'probabilities'
  | 'sample'

export type VizEdgeId =
  | 'context-to-token-embedding'
  | 'context-to-position-embedding'
  | 'token-embedding-to-residual-stream'
  | 'position-embedding-to-residual-stream'
  | 'residual-stream-to-norm-1'
  | 'norm-1-to-qkv'
  | 'qkv-to-attention-head-1'
  | 'qkv-to-attention-head-2'
  | 'qkv-to-attention-head-3'
  | 'qkv-to-attention-head-4'
  | 'attention-head-1-to-attention-mix'
  | 'attention-head-2-to-attention-mix'
  | 'attention-head-3-to-attention-mix'
  | 'attention-head-4-to-attention-mix'
  | 'attention-mix-to-residual-add-1'
  | 'residual-add-1-to-norm-2'
  | 'norm-2-to-mlp'
  | 'mlp-to-logits'
  | 'logits-to-probabilities'
  | 'probabilities-to-sample'

export type CameraPoseId =
  | 'overview'
  | 'input'
  | 'attention'
  | 'residual'
  | 'readout'
  | 'sample'

export type VizOverlayKind =
  | 'context-cache'
  | 'embedding-lookup'
  | 'projection'
  | 'attention-scores'
  | 'attention-weights'
  | 'attention-mix'
  | 'residual-update'
  | 'mlp'
  | 'logits'
  | 'sample'

export type TensorColorScale = 'diverging' | 'sequential'

export interface SceneModelData {
  config: ModelConfig
  vocab: string[]
  weights: Record<string, MatrixData>
}

export interface CameraPose {
  panX: number
  panY: number
  scale: number
}

export interface VizLayoutNode {
  id: VizNodeId
  label: string
  subtitle: string
  x: number
  y: number
  z: number
  width: number
  height: number
  depth: number
}

export interface VizLayoutEdge {
  id: VizEdgeId
  from: VizNodeId
  to: VizNodeId
}

export interface VizLayout {
  nodes: VizLayoutNode[]
  edges: VizLayoutEdge[]
}

export interface ProjectedNode {
  id: VizNodeId
  label: string
  subtitle: string
  front: [number, number][]
  top: [number, number][]
  side: [number, number][]
  center: { x: number; y: number }
  anchors: {
    top: { x: number; y: number }
    right: { x: number; y: number }
    bottom: { x: number; y: number }
    left: { x: number; y: number }
  }
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
}

export interface ProjectedEdge {
  id: VizEdgeId
  from: VizNodeId
  to: VizNodeId
  start: { x: number; y: number }
  end: { x: number; y: number }
}

export interface ProjectedScene {
  nodes: ProjectedNode[]
  edges: ProjectedEdge[]
  nodeMap: Record<VizNodeId, ProjectedNode>
  edgeMap: Record<VizEdgeId, ProjectedEdge>
}

export interface ContextOverlaySlot {
  label: string
  emphasis: number
  isCurrent: boolean
}

export interface AttentionReadOverlay {
  headId: VizNodeId
  headLabel: string
  targetLabel: string
  weight: number
  targetIndex: number
}

export interface TensorCellStyle {
  row: number
  col: number
  tone: 'focus' | 'lookup' | 'result' | 'emphasis'
  label?: string
}

export interface TensorLookupHighlight {
  label: string
  description: string
}

export interface TensorSurface {
  id: string
  label: string
  rows: number
  cols: number
  data: readonly number[]
  rowLabels: string[]
  colLabels: string[]
  highlightedRows?: number[]
  highlightedCols?: number[]
  highlightedCells?: TensorCellStyle[]
  colorScale: TensorColorScale
  minValue: number
  maxValue: number
}

export interface VectorStripOverlay {
  id: string
  label: string
  values: readonly number[]
  itemLabels: string[]
  highlightedIndices?: number[]
  colorScale: TensorColorScale
  minValue: number
  maxValue: number
}

export interface TensorProjectionOverlay {
  equation: string
  input: VectorStripOverlay
  outputs: VectorStripOverlay[]
}

export interface AttentionGridOverlay {
  headLabel: string
  surface: TensorSurface
  result: VectorStripOverlay
}

export interface SceneFocusWindow {
  id: string
  title: string
  subtitle: string
  anchorNodeId: VizNodeId
  placement: 'right' | 'left' | 'below' | 'center'
  surfaces: TensorSurface[]
  vectors: VectorStripOverlay[]
  lookups?: TensorLookupHighlight[]
  projection?: TensorProjectionOverlay
  attention?: AttentionGridOverlay[]
  note?: string
}

type BaseOverlay = {
  focusWindow: SceneFocusWindow
}

export type VizOverlay =
  | (BaseOverlay & {
      kind: 'context-cache'
      slots: ContextOverlaySlot[]
    })
  | (BaseOverlay & {
      kind: 'embedding-lookup'
      slots: ContextOverlaySlot[]
    })
  | (BaseOverlay & {
      kind: 'projection'
      slots: ContextOverlaySlot[]
      attentionReads: AttentionReadOverlay[]
    })
  | (BaseOverlay & {
      kind: 'attention-scores'
      slots: ContextOverlaySlot[]
      attentionReads: AttentionReadOverlay[]
    })
  | (BaseOverlay & {
      kind: 'attention-weights'
      slots: ContextOverlaySlot[]
      attentionReads: AttentionReadOverlay[]
    })
  | (BaseOverlay & {
      kind: 'attention-mix'
      slots: ContextOverlaySlot[]
      attentionReads: AttentionReadOverlay[]
    })
  | (BaseOverlay & {
      kind: 'residual-update'
    })
  | (BaseOverlay & {
      kind: 'mlp'
    })
  | (BaseOverlay & {
      kind: 'logits'
    })
  | (BaseOverlay & {
      kind: 'sample'
    })

export interface VizFrame {
  focusNodeId: VizNodeId
  emphasisNodeIds: VizNodeId[]
  emphasisEdgeIds: VizEdgeId[]
  cameraPoseId: CameraPoseId
  overlay: VizOverlay
  currentSlotLabel: string
  transitionLabel: string
}

export interface VizPick {
  kind: 'node' | 'edge'
  id: VizNodeId | VizEdgeId
}
