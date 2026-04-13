import type { ModelConfig } from '../../model'
import type {
  CameraPose,
  CameraPoseId,
  ProjectedEdge,
  ProjectedNode,
  ProjectedScene,
  VizLayout,
  VizLayoutEdge,
  VizLayoutNode,
  VizNodeId,
} from './types'

const cameraPoses: Record<CameraPoseId, CameraPose> = {
  overview: { panX: 0, panY: -40, scale: 0.68 },
  input: { panX: 0, panY: 24, scale: 0.9 },
  attention: { panX: 0, panY: -300, scale: 0.92 },
  residual: { panX: 0, panY: -560, scale: 0.96 },
  readout: { panX: 0, panY: -850, scale: 1.02 },
  sample: { panX: 0, panY: -1040, scale: 1.08 },
}

const depthTiltX = 0.56
const depthTiltY = 0.56
const baseCanvasWidth = 760
const baseCanvasHeight = 1280

const baseNodes: VizLayoutNode[] = [
  {
    id: 'context',
    label: 'Context Strip',
    subtitle: 'visible slots',
    x: -170,
    y: 80,
    z: 0,
    width: 340,
    height: 66,
    depth: 16,
  },
  {
    id: 'token-embedding',
    label: 'Token Embedding',
    subtitle: 'row lookup',
    x: -220,
    y: 220,
    z: 0,
    width: 190,
    height: 58,
    depth: 16,
  },
  {
    id: 'position-embedding',
    label: 'Position Embedding',
    subtitle: 'row lookup',
    x: 30,
    y: 220,
    z: 0,
    width: 190,
    height: 58,
    depth: 16,
  },
  {
    id: 'residual-stream',
    label: 'Residual Stream',
    subtitle: 'sum the inputs',
    x: -120,
    y: 356,
    z: 0,
    width: 240,
    height: 66,
    depth: 18,
  },
  {
    id: 'norm-1',
    label: 'Norm 1',
    subtitle: 'RMSNorm',
    x: -86,
    y: 464,
    z: 0,
    width: 172,
    height: 56,
    depth: 16,
  },
  {
    id: 'qkv',
    label: 'Q / K / V',
    subtitle: 'three projections',
    x: -126,
    y: 584,
    z: 0,
    width: 252,
    height: 66,
    depth: 18,
  },
  {
    id: 'attention-head-1',
    label: 'Head 1',
    subtitle: 'read lane',
    x: -274,
    y: 736,
    z: 0,
    width: 112,
    height: 92,
    depth: 18,
  },
  {
    id: 'attention-head-2',
    label: 'Head 2',
    subtitle: 'read lane',
    x: -132,
    y: 736,
    z: 0,
    width: 112,
    height: 92,
    depth: 18,
  },
  {
    id: 'attention-head-3',
    label: 'Head 3',
    subtitle: 'read lane',
    x: 10,
    y: 736,
    z: 0,
    width: 112,
    height: 92,
    depth: 18,
  },
  {
    id: 'attention-head-4',
    label: 'Head 4',
    subtitle: 'read lane',
    x: 152,
    y: 736,
    z: 0,
    width: 112,
    height: 92,
    depth: 18,
  },
  {
    id: 'attention-mix',
    label: 'Attention Mix',
    subtitle: 'weighted values',
    x: -126,
    y: 900,
    z: 0,
    width: 252,
    height: 66,
    depth: 18,
  },
  {
    id: 'residual-add-1',
    label: 'Residual Add',
    subtitle: 'write back',
    x: -126,
    y: 1018,
    z: 0,
    width: 252,
    height: 66,
    depth: 18,
  },
  {
    id: 'norm-2',
    label: 'Norm 2',
    subtitle: 'RMSNorm',
    x: -86,
    y: 1130,
    z: 0,
    width: 172,
    height: 56,
    depth: 16,
  },
  {
    id: 'mlp',
    label: 'MLP',
    subtitle: 'expand / project',
    x: -170,
    y: 1252,
    z: 0,
    width: 340,
    height: 112,
    depth: 20,
  },
  {
    id: 'logits',
    label: 'Logits',
    subtitle: 'raw scores',
    x: -126,
    y: 1434,
    z: 0,
    width: 252,
    height: 66,
    depth: 18,
  },
  {
    id: 'probabilities',
    label: 'Probabilities',
    subtitle: 'softmax',
    x: -126,
    y: 1552,
    z: 0,
    width: 252,
    height: 66,
    depth: 18,
  },
  {
    id: 'sample',
    label: 'Sample / Append',
    subtitle: 'loop or stop',
    x: -126,
    y: 1670,
    z: 0,
    width: 252,
    height: 66,
    depth: 18,
  },
]

const baseEdges: VizLayoutEdge[] = [
  { id: 'context-to-token-embedding', from: 'context', to: 'token-embedding' },
  {
    id: 'context-to-position-embedding',
    from: 'context',
    to: 'position-embedding',
  },
  {
    id: 'token-embedding-to-residual-stream',
    from: 'token-embedding',
    to: 'residual-stream',
  },
  {
    id: 'position-embedding-to-residual-stream',
    from: 'position-embedding',
    to: 'residual-stream',
  },
  { id: 'residual-stream-to-norm-1', from: 'residual-stream', to: 'norm-1' },
  { id: 'norm-1-to-qkv', from: 'norm-1', to: 'qkv' },
  { id: 'qkv-to-attention-head-1', from: 'qkv', to: 'attention-head-1' },
  { id: 'qkv-to-attention-head-2', from: 'qkv', to: 'attention-head-2' },
  { id: 'qkv-to-attention-head-3', from: 'qkv', to: 'attention-head-3' },
  { id: 'qkv-to-attention-head-4', from: 'qkv', to: 'attention-head-4' },
  {
    id: 'attention-head-1-to-attention-mix',
    from: 'attention-head-1',
    to: 'attention-mix',
  },
  {
    id: 'attention-head-2-to-attention-mix',
    from: 'attention-head-2',
    to: 'attention-mix',
  },
  {
    id: 'attention-head-3-to-attention-mix',
    from: 'attention-head-3',
    to: 'attention-mix',
  },
  {
    id: 'attention-head-4-to-attention-mix',
    from: 'attention-head-4',
    to: 'attention-mix',
  },
  {
    id: 'attention-mix-to-residual-add-1',
    from: 'attention-mix',
    to: 'residual-add-1',
  },
  {
    id: 'residual-add-1-to-norm-2',
    from: 'residual-add-1',
    to: 'norm-2',
  },
  { id: 'norm-2-to-mlp', from: 'norm-2', to: 'mlp' },
  { id: 'mlp-to-logits', from: 'mlp', to: 'logits' },
  { id: 'logits-to-probabilities', from: 'logits', to: 'probabilities' },
  { id: 'probabilities-to-sample', from: 'probabilities', to: 'sample' },
]

function getNodeMap(nodes: VizLayoutNode[]) {
  return Object.fromEntries(
    nodes.map((node) => [node.id, node]),
  ) as Record<VizNodeId, VizLayoutNode>
}

export function buildMicrogptLayout(config: ModelConfig): VizLayout {
  const headLabels = Array.from({ length: config.nHead }, (_, index) => index + 1)
  const nodes = baseNodes.filter((node) => {
    if (!node.id.startsWith('attention-head-')) {
      return true
    }
    const headIndex = Number(node.id.slice(-1))
    return headIndex <= headLabels.length
  })
  const edges = baseEdges.filter((edge) => {
    const headMatch = edge.id.match(/attention-head-(\d)/)
    if (!headMatch) {
      return true
    }
    return Number(headMatch[1]) <= headLabels.length
  })
  return { nodes, edges }
}

export function getCameraPose(cameraPoseId: CameraPoseId): CameraPose {
  return cameraPoses[cameraPoseId]
}

export function lerpCameraPose(
  from: CameraPose,
  to: CameraPose,
  amount: number,
): CameraPose {
  return {
    panX: from.panX + (to.panX - from.panX) * amount,
    panY: from.panY + (to.panY - from.panY) * amount,
    scale: from.scale + (to.scale - from.scale) * amount,
  }
}

export function getProjectedScale(width: number, height: number, pose: CameraPose) {
  const viewportScale = Math.min(width / baseCanvasWidth, height / baseCanvasHeight)
  return viewportScale * pose.scale
}

function projectPoint(
  x: number,
  y: number,
  z: number,
  pose: CameraPose,
  width: number,
  height: number,
) {
  const scale = getProjectedScale(width, height, pose)
  const centerX = width / 2 + pose.panX * scale
  const topInset = Math.max(40, height * 0.08)
  return {
    x: centerX + x * scale + z * depthTiltX * scale,
    y: topInset + (y + pose.panY) * scale - z * depthTiltY * scale,
  }
}

function buildProjectedNode(
  node: VizLayoutNode,
  pose: CameraPose,
  width: number,
  height: number,
): ProjectedNode {
  const front = [
    projectPoint(node.x, node.y, node.z, pose, width, height),
    projectPoint(node.x + node.width, node.y, node.z, pose, width, height),
    projectPoint(
      node.x + node.width,
      node.y + node.height,
      node.z,
      pose,
      width,
      height,
    ),
    projectPoint(node.x, node.y + node.height, node.z, pose, width, height),
  ]
  const top = [
    projectPoint(node.x, node.y, node.z, pose, width, height),
    projectPoint(node.x + node.depth, node.y, node.z + node.depth, pose, width, height),
    projectPoint(
      node.x + node.width + node.depth,
      node.y,
      node.z + node.depth,
      pose,
      width,
      height,
    ),
    projectPoint(node.x + node.width, node.y, node.z, pose, width, height),
  ]
  const side = [
    projectPoint(node.x + node.width, node.y, node.z, pose, width, height),
    projectPoint(
      node.x + node.width + node.depth,
      node.y,
      node.z + node.depth,
      pose,
      width,
      height,
    ),
    projectPoint(
      node.x + node.width + node.depth,
      node.y + node.height,
      node.z + node.depth,
      pose,
      width,
      height,
    ),
    projectPoint(
      node.x + node.width,
      node.y + node.height,
      node.z,
      pose,
      width,
      height,
    ),
  ]

  const allPoints = [...front, ...top, ...side]
  const xs = allPoints.map((point) => point.x)
  const ys = allPoints.map((point) => point.y)

  return {
    id: node.id,
    label: node.label,
    subtitle: node.subtitle,
    front: front.map((point) => [point.x, point.y]),
    top: top.map((point) => [point.x, point.y]),
    side: side.map((point) => [point.x, point.y]),
    center: {
      x: (front[0].x + front[1].x) / 2,
      y: (front[0].y + front[2].y) / 2,
    },
    anchors: {
      top: {
        x: (top[1].x + top[2].x) / 2,
        y: (top[1].y + top[2].y) / 2,
      },
      right: {
        x: (side[0].x + side[2].x) / 2,
        y: (side[0].y + side[2].y) / 2,
      },
      bottom: {
        x: (front[2].x + front[3].x) / 2,
        y: (front[2].y + front[3].y) / 2,
      },
      left: {
        x: (front[0].x + front[3].x) / 2,
        y: (front[0].y + front[3].y) / 2,
      },
    },
    bounds: {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    },
  }
}

function buildProjectedEdge(
  edge: VizLayoutEdge,
  nodeMap: Record<VizNodeId, ProjectedNode>,
): ProjectedEdge {
  const fromNode = nodeMap[edge.from]
  const toNode = nodeMap[edge.to]

  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    start: fromNode.anchors.bottom,
    end: toNode.anchors.top,
  }
}

export function projectScene(
  layout: VizLayout,
  pose: CameraPose,
  width: number,
  height: number,
): ProjectedScene {
  const nodes = layout.nodes.map((node) => buildProjectedNode(node, pose, width, height))
  const nodeMap = Object.fromEntries(
    nodes.map((node) => [node.id, node]),
  ) as Record<VizNodeId, ProjectedNode>
  const edges = layout.edges.map((edge) => buildProjectedEdge(edge, nodeMap))
  const edgeMap = Object.fromEntries(
    edges.map((edge) => [edge.id, edge]),
  ) as Record<VizLayoutEdge['id'], ProjectedEdge>

  return { nodes, edges, nodeMap, edgeMap }
}

export function getNodeFrontLabelPosition(node: ProjectedNode) {
  return {
    x: node.front[0][0] + 14,
    y: node.front[0][1] + 24,
  }
}

export function getNodeSubtitlePosition(node: ProjectedNode) {
  return {
    x: node.front[0][0] + 14,
    y: node.front[0][1] + 42,
  }
}

export function getLayoutNodeMap(layout: VizLayout) {
  return getNodeMap(layout.nodes)
}
