import {
  getCameraPose,
  getProjectedScale,
  lerpCameraPose,
  projectScene,
} from './layout'
import type {
  CameraPose,
  ProjectedScene,
  VizEdgeId,
  VizFrame,
  VizLayout,
  VizNodeId,
  VizPick,
} from './types'

type RenderMode = 'webgl2' | 'projected-2d'

interface GlResources {
  program: WebGLProgram
  buffer: WebGLBuffer
  positionLocation: number
  colorLocation: number
  resolutionLocation: WebGLUniformLocation
}

interface ColoredLine {
  start: { x: number; y: number }
  end: { x: number; y: number }
  color: [number, number, number, number]
}

const animationDurationMs = 240

const colors = {
  background: [11 / 255, 15 / 255, 19 / 255, 1] as const,
  connector: [91 / 255, 105 / 255, 123 / 255, 0.26] as const,
  connectorActive: [97 / 255, 175 / 255, 239 / 255, 0.74] as const,
  connectorEmphasis: [140 / 255, 197 / 255, 255 / 255, 0.95] as const,
  nodeUpcomingFront: [20 / 255, 28 / 255, 39 / 255, 1] as const,
  nodeUpcomingTop: [28 / 255, 39 / 255, 53 / 255, 1] as const,
  nodeUpcomingSide: [17 / 255, 24 / 255, 34 / 255, 1] as const,
  nodeCompleteFront: [30 / 255, 62 / 255, 94 / 255, 0.86] as const,
  nodeCompleteTop: [43 / 255, 90 / 255, 133 / 255, 0.94] as const,
  nodeCompleteSide: [24 / 255, 48 / 255, 74 / 255, 0.92] as const,
  nodeActiveFront: [67 / 255, 134 / 255, 196 / 255, 1] as const,
  nodeActiveTop: [111 / 255, 179 / 255, 240 / 255, 1] as const,
  nodeActiveSide: [44 / 255, 96 / 255, 144 / 255, 1] as const,
  nodeEmphasisFront: [98 / 255, 178 / 255, 1, 1] as const,
  nodeEmphasisTop: [145 / 255, 205 / 255, 1, 1] as const,
  nodeEmphasisSide: [58 / 255, 116 / 255, 173 / 255, 1] as const,
} as const

function easeInOut(amount: number) {
  return amount < 0.5
    ? 4 * amount * amount * amount
    : 1 - Math.pow(-2 * amount + 2, 3) / 2
}

function pointInPolygon(
  point: { x: number; y: number },
  polygon: [number, number][],
) {
  let inside = false
  for (let index = 0, last = polygon.length - 1; index < polygon.length; last = index++) {
    const [x1, y1] = polygon[index]
    const [x2, y2] = polygon[last]
    const intersects =
      y1 > point.y !== y2 > point.y &&
      point.x < ((x2 - x1) * (point.y - y1)) / (y2 - y1 + 1e-6) + x1
    if (intersects) {
      inside = !inside
    }
  }
  return inside
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y)
  }
  const projection = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  )
  const x = start.x + projection * dx
  const y = start.y + projection * dy
  return Math.hypot(point.x - x, point.y - y)
}

function flattenTriangles(points: [number, number][], color: readonly number[]) {
  const [a, b, c, d] = points
  return [
    a[0],
    a[1],
    ...color,
    b[0],
    b[1],
    ...color,
    c[0],
    c[1],
    ...color,
    a[0],
    a[1],
    ...color,
    c[0],
    c[1],
    ...color,
    d[0],
    d[1],
    ...color,
  ]
}

function flattenLine(
  start: { x: number; y: number },
  end: { x: number; y: number },
  color: readonly number[],
) {
  return [start.x, start.y, ...color, end.x, end.y, ...color]
}

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to create shader.')
  }
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(info || 'Failed to compile shader.')
  }
  return shader
}

function createGlResources(gl: WebGL2RenderingContext): GlResources {
  const vertexShader = createShader(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
    in vec2 a_position;
    in vec4 a_color;
    uniform vec2 u_resolution;
    out vec4 v_color;
    void main() {
      vec2 zeroToOne = a_position / u_resolution;
      vec2 zeroToTwo = zeroToOne * 2.0;
      vec2 clip = zeroToTwo - 1.0;
      gl_Position = vec4(clip * vec2(1.0, -1.0), 0.0, 1.0);
      v_color = a_color;
    }`,
  )
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
    precision mediump float;
    in vec4 v_color;
    out vec4 outColor;
    void main() {
      outColor = v_color;
    }`,
  )
  const program = gl.createProgram()
  const buffer = gl.createBuffer()
  if (!program || !buffer) {
    throw new Error('Failed to allocate WebGL resources.')
  }
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    throw new Error(info || 'Failed to link program.')
  }

  const positionLocation = gl.getAttribLocation(program, 'a_position')
  const colorLocation = gl.getAttribLocation(program, 'a_color')
  const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
  if (resolutionLocation == null) {
    throw new Error('Failed to bind WebGL uniforms.')
  }

  return {
    program,
    buffer,
    positionLocation,
    colorLocation,
    resolutionLocation,
  }
}

function getNodeFaceColors(
  focusNodeId: VizNodeId,
  emphasisNodeIds: VizNodeId[],
  nodeId: VizNodeId,
) {
  if (nodeId === focusNodeId) {
    return {
      front: colors.nodeActiveFront,
      top: colors.nodeActiveTop,
      side: colors.nodeActiveSide,
    }
  }
  if (emphasisNodeIds.includes(nodeId)) {
    return {
      front: colors.nodeEmphasisFront,
      top: colors.nodeEmphasisTop,
      side: colors.nodeEmphasisSide,
    }
  }
  const activeOrder = emphasisNodeIds.length > 0 ? emphasisNodeIds : [focusNodeId]
  return activeOrder.includes(nodeId)
    ? {
        front: colors.nodeCompleteFront,
        top: colors.nodeCompleteTop,
        side: colors.nodeCompleteSide,
      }
    : {
        front: colors.nodeUpcomingFront,
        top: colors.nodeUpcomingTop,
        side: colors.nodeUpcomingSide,
      }
}

function buildAttentionLines(
  frame: VizFrame,
  scene: ProjectedScene,
): ColoredLine[] {
  if (
    frame.overlay.kind !== 'projection' &&
    frame.overlay.kind !== 'attention-scores' &&
    frame.overlay.kind !== 'attention-weights' &&
    frame.overlay.kind !== 'attention-mix'
  ) {
    return []
  }

  const contextNode = scene.nodeMap.context
  const totalSlots = Math.max(1, frame.overlay.slots.length)

  return frame.overlay.attentionReads.map((read) => {
    const slotX =
      contextNode.bounds.minX +
      ((read.targetIndex + 0.5) / totalSlots) *
        (contextNode.bounds.maxX - contextNode.bounds.minX)
    const slotY = contextNode.bounds.maxY - 8
    return {
      start: { x: slotX, y: slotY },
      end: scene.nodeMap[read.headId].anchors.top,
      color: [
        colors.connectorEmphasis[0],
        colors.connectorEmphasis[1],
        colors.connectorEmphasis[2],
        Math.max(0.2, read.weight),
      ],
    }
  })
}

export class VizRenderer {
  private canvas: HTMLCanvasElement | null = null
  private layout: VizLayout | null = null
  private ctx2d: CanvasRenderingContext2D | null = null
  private gl: WebGL2RenderingContext | null = null
  private glResources: GlResources | null = null
  private width = 0
  private height = 0
  private frame: VizFrame | null = null
  private currentPose: CameraPose = getCameraPose('overview')
  private startPose: CameraPose = this.currentPose
  private targetPose: CameraPose = this.currentPose
  private scene: ProjectedScene | null = null
  private animationFrame = 0
  private animationStart = 0
  private renderMode: RenderMode = 'projected-2d'

  get mode() {
    return this.renderMode
  }

  mount(canvas: HTMLCanvasElement, layout: VizLayout) {
    this.canvas = canvas
    this.layout = layout
    this.gl = null
    this.ctx2d = null
    this.glResources = null

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
    })

    if (gl) {
      try {
        this.gl = gl
        this.glResources = createGlResources(gl)
        this.renderMode = 'webgl2'
      } catch {
        this.gl = null
        this.glResources = null
      }
    }

    if (!this.gl) {
      this.ctx2d = canvas.getContext('2d')
      this.renderMode = 'projected-2d'
    }

    this.currentPose = getCameraPose('overview')
    this.startPose = this.currentPose
    this.targetPose = this.currentPose

    return { mode: this.renderMode }
  }

  resize(width: number, height: number) {
    if (!this.canvas) {
      return
    }

    this.width = Math.max(1, Math.floor(width))
    this.height = Math.max(1, Math.floor(height))
    const dpr = window.devicePixelRatio || 1
    this.canvas.width = Math.round(this.width * dpr)
    this.canvas.height = Math.round(this.height * dpr)
    this.canvas.style.width = `${this.width}px`
    this.canvas.style.height = `${this.height}px`

    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    } else if (this.ctx2d) {
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    this.render()
  }

  setFrame(frame: VizFrame) {
    this.frame = frame
    this.startPose = this.currentPose
    this.targetPose = getCameraPose(frame.cameraPoseId)
    this.animationStart = 0
    this.startAnimation()
  }

  pick(screenX: number, screenY: number): VizPick | null {
    if (!this.scene) {
      return null
    }

    const point = { x: screenX, y: screenY }
    const reversedNodes = [...this.scene.nodes].reverse()
    for (const node of reversedNodes) {
      if (
        point.x >= node.bounds.minX &&
        point.x <= node.bounds.maxX &&
        point.y >= node.bounds.minY &&
        point.y <= node.bounds.maxY &&
        (pointInPolygon(point, node.front) ||
          pointInPolygon(point, node.top) ||
          pointInPolygon(point, node.side))
      ) {
        return { kind: 'node', id: node.id }
      }
    }

    const reversedEdges = [...this.scene.edges].reverse()
    for (const edge of reversedEdges) {
      if (distanceToSegment(point, edge.start, edge.end) < 8) {
        return { kind: 'edge', id: edge.id }
      }
    }

    return null
  }

  dispose() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = 0
    }
    if (this.gl && this.glResources) {
      this.gl.deleteBuffer(this.glResources.buffer)
      this.gl.deleteProgram(this.glResources.program)
    }
    this.gl = null
    this.ctx2d = null
    this.glResources = null
    this.canvas = null
    this.layout = null
    this.frame = null
    this.scene = null
  }

  private startAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
    }

    const tick = (timestamp: number) => {
      if (this.animationStart === 0) {
        this.animationStart = timestamp
      }
      const elapsed = timestamp - this.animationStart
      const amount = Math.min(1, elapsed / animationDurationMs)
      this.currentPose = lerpCameraPose(
        this.startPose,
        this.targetPose,
        easeInOut(amount),
      )
      this.render()
      if (amount < 1) {
        this.animationFrame = requestAnimationFrame(tick)
      } else {
        this.animationFrame = 0
      }
    }

    this.animationFrame = requestAnimationFrame(tick)
  }

  private render() {
    if (!this.layout || !this.frame || this.width === 0 || this.height === 0) {
      return
    }

    this.scene = projectScene(this.layout, this.currentPose, this.width, this.height)
    if (this.gl && this.glResources) {
      this.renderWebGl(this.scene, this.frame)
      return
    }
    if (this.ctx2d) {
      this.render2d(this.scene, this.frame)
    }
  }

  private renderWebGl(scene: ProjectedScene, frame: VizFrame) {
    const triangles: number[] = []
    const lines: number[] = []

    for (const edge of scene.edges) {
      const color = frame.emphasisEdgeIds.includes(edge.id)
        ? colors.connectorEmphasis
        : frame.focusNodeId === edge.to ||
            frame.focusNodeId === edge.from ||
            frame.emphasisNodeIds.includes(edge.from) ||
            frame.emphasisNodeIds.includes(edge.to)
          ? colors.connectorActive
          : colors.connector
      lines.push(...flattenLine(edge.start, edge.end, color))
    }

    for (const line of buildAttentionLines(frame, scene)) {
      lines.push(...flattenLine(line.start, line.end, line.color))
    }

    for (const node of scene.nodes) {
      const faceColors = getNodeFaceColors(
        frame.focusNodeId,
        frame.emphasisNodeIds,
        node.id,
      )
      triangles.push(...flattenTriangles(node.top, faceColors.top))
      triangles.push(...flattenTriangles(node.side, faceColors.side))
      triangles.push(...flattenTriangles(node.front, faceColors.front))
    }

    const gl = this.gl!
    const { program, buffer, positionLocation, colorLocation, resolutionLocation } =
      this.glResources!

    gl.clearColor(...colors.background)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

    const draw = (vertices: number[], primitive: number) => {
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW)
      gl.enableVertexAttribArray(positionLocation)
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 24, 0)
      gl.enableVertexAttribArray(colorLocation)
      gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 24, 8)
      gl.uniform2f(resolutionLocation, this.width, this.height)
      gl.drawArrays(primitive, 0, vertices.length / 6)
    }

    draw(triangles, gl.TRIANGLES)
    draw(lines, gl.LINES)
  }

  private render2d(scene: ProjectedScene, frame: VizFrame) {
    const context = this.ctx2d!
    context.clearRect(0, 0, this.width, this.height)
    context.fillStyle = 'rgba(11, 15, 19, 1)'
    context.fillRect(0, 0, this.width, this.height)

    for (const edge of scene.edges) {
      const color = frame.emphasisEdgeIds.includes(edge.id)
        ? colors.connectorEmphasis
        : frame.focusNodeId === edge.to ||
            frame.focusNodeId === edge.from ||
            frame.emphasisNodeIds.includes(edge.from) ||
            frame.emphasisNodeIds.includes(edge.to)
          ? colors.connectorActive
          : colors.connector
      context.strokeStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(
        color[1] * 255,
      )}, ${Math.round(color[2] * 255)}, ${color[3]})`
      context.lineWidth = Math.max(1.5, getProjectedScale(this.width, this.height, this.currentPose) * 1.8)
      context.beginPath()
      context.moveTo(edge.start.x, edge.start.y)
      context.lineTo(edge.end.x, edge.end.y)
      context.stroke()
    }

    for (const line of buildAttentionLines(frame, scene)) {
      context.strokeStyle = `rgba(${Math.round(line.color[0] * 255)}, ${Math.round(
        line.color[1] * 255,
      )}, ${Math.round(line.color[2] * 255)}, ${line.color[3]})`
      context.beginPath()
      context.moveTo(line.start.x, line.start.y)
      context.lineTo(line.end.x, line.end.y)
      context.stroke()
    }

    for (const node of scene.nodes) {
      const faceColors = getNodeFaceColors(
        frame.focusNodeId,
        frame.emphasisNodeIds,
        node.id,
      )
      const drawPolygon = (polygon: [number, number][], color: readonly number[]) => {
        context.fillStyle = `rgba(${Math.round(color[0] * 255)}, ${Math.round(
          color[1] * 255,
        )}, ${Math.round(color[2] * 255)}, ${color[3]})`
        context.beginPath()
        context.moveTo(polygon[0][0], polygon[0][1])
        polygon.slice(1).forEach(([x, y]) => context.lineTo(x, y))
        context.closePath()
        context.fill()
      }

      drawPolygon(node.top, faceColors.top)
      drawPolygon(node.side, faceColors.side)
      drawPolygon(node.front, faceColors.front)
    }
  }
}

export function getPickFocusId(pick: VizPick) {
  return pick.id as VizNodeId | VizEdgeId
}
