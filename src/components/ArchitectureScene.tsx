import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import type { TokenStepTrace } from '../model'
import { vizFocusRanges, type PhaseDefinition, type LineRange } from '../walkthrough/phases'
import { buildVizFrame } from '../viz/llmViz/frame'
import {
  buildMicrogptLayout,
  getProjectedScale,
  getCameraPose,
  projectScene,
} from '../viz/llmViz/layout'
import type {
  AttentionGridOverlay,
  CameraPose,
  ContextOverlaySlot,
  ProjectedNode,
  ProjectedScene,
  SceneFocusWindow,
  SceneModelData,
  TensorSurface,
  VectorStripOverlay,
  VizOverlay,
} from '../viz/llmViz/types'
import { buildMicroVizPhaseState, createMicroVizTextures, drawMicroVizEdges, uploadMicroVizFrame, applyMicroVizPhase } from '../viz/microViz/bridge'
import { buildMicroVizLayout } from '../viz/microViz/layout'
import type {
  MicroVizPhaseState,
  MicroVizRenderContext,
} from '../viz/microViz/types'
import type { ICamera } from '../vendor/llmVizOriginal/llm/Camera'
import {
  genModelViewMatrices,
  updateCamera,
} from '../vendor/llmVizOriginal/llm/Camera'
import { drawBlockInfo } from '../vendor/llmVizOriginal/llm/components/BlockInfo'
import { fetchFontAtlasData } from '../vendor/llmVizOriginal/llm/render/fontRender'
import {
  initRender,
  renderModel,
  resetRenderBuffers,
} from '../vendor/llmVizOriginal/llm/render/modelRender'
import { Mat4f } from '../vendor/llmVizOriginal/utils/matrix'
import { Vec3 } from '../vendor/llmVizOriginal/utils/vector'

interface ArchitectureSceneProps {
  trace: TokenStepTrace
  phase: PhaseDefinition
  contextTokens: string[]
  tokenLabel: (tokenId: number) => string
  sceneModelData: SceneModelData
  onFocusRanges: (ranges: LineRange[] | null) => void
}

interface ViewportSize {
  width: number
  height: number
}

function useViewportSize<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [size, setSize] = useState<ViewportSize>({ width: 760, height: 680 })

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const update = () => {
      const bounds = element.getBoundingClientRect()
      setSize({
        width: Math.max(320, Math.round(bounds.width)),
        height: Math.max(420, Math.round(bounds.height)),
      })
    }

    update()
    const ResizeObserverCtor = globalThis.ResizeObserver
    if (!ResizeObserverCtor) {
      return
    }
    const observer = new ResizeObserverCtor(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}

function createCamera(initialCenter: Vec3, initialAngle: Vec3): ICamera {
  return {
    angle: new Vec3(initialAngle.x, initialAngle.y, initialAngle.z),
    center: new Vec3(initialCenter.x, initialCenter.y, initialCenter.z),
    transition: {},
    modelMtx: new Mat4f(),
    viewMtx: new Mat4f(),
    lookAtMtx: new Mat4f(),
    camPos: new Vec3(),
    camPosModel: new Vec3(),
  }
}

class MicroVizCanvasController {
  private renderContext: MicroVizRenderContext
  private phaseState: MicroVizPhaseState | null = null
  private stopped = false
  private canvasSizeDirty = true
  private rafHandle = 0
  private prevTime = performance.now()
  private lastCameraPoseId: PhaseDefinition['viz']['cameraPoseId'] | null = null

  constructor(
    private canvasEl: HTMLCanvasElement,
    sceneModelData: SceneModelData,
    fontAtlasData: Awaited<ReturnType<typeof fetchFontAtlasData>>,
  ) {
    const renderState = initRender(canvasEl, fontAtlasData)
    if (!renderState) {
      throw new Error('WebGL2 unavailable')
    }

    const layout = buildMicroVizLayout(sceneModelData)
    const textures = createMicroVizTextures(renderState.gl, sceneModelData)
    const overview = layout.cameraPoses.overview
    const camera = createCamera(overview.center, overview.angle)

    this.renderContext = {
      renderState,
      layout,
      textures,
      camera,
    }
  }

  destroy() {
    this.stopped = true
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = 0
    }
  }

  resize() {
    this.canvasSizeDirty = true
    this.markDirty()
  }

  panByPixels(deltaX: number, deltaY: number) {
    const camAngle = this.renderContext.camera.angle
    const sideMul = Math.sin((camAngle.x * Math.PI) / 180) > 0 ? 1 : -1
    this.renderContext.camera.desiredCamera = undefined
    this.renderContext.camera.desiredCameraTransition = undefined
    this.renderContext.camera.center = new Vec3(
      this.renderContext.camera.center.x + sideMul * deltaX * 0.1 * camAngle.z,
      this.renderContext.camera.center.y,
      this.renderContext.camera.center.z + deltaY * 0.1 * camAngle.z,
    )
    this.markDirty()
  }

  zoomByDelta(deltaY: number) {
    const camAngle = this.renderContext.camera.angle
    this.renderContext.camera.desiredCamera = undefined
    this.renderContext.camera.desiredCameraTransition = undefined
    this.renderContext.camera.angle = new Vec3(
      camAngle.x,
      camAngle.y,
      clamp(camAngle.z * Math.pow(1.0013, deltaY), 0.01, 100000),
    )
    this.markDirty()
  }

  resetToCameraPose(cameraPoseId: PhaseDefinition['viz']['cameraPoseId']) {
    this.renderContext.camera.desiredCamera =
      this.renderContext.layout.cameraPoses[cameraPoseId]
    this.lastCameraPoseId = cameraPoseId
    this.markDirty()
  }

  setFrame(
    sceneModelData: SceneModelData,
    phase: PhaseDefinition,
    trace: TokenStepTrace,
    contextTokens: string[],
    vizFrame: ReturnType<typeof buildVizFrame>,
  ) {
    const phaseState = buildMicroVizPhaseState(phase, vizFrame, this.renderContext.layout)
    this.phaseState = phaseState
    uploadMicroVizFrame(
      this.renderContext,
      sceneModelData,
      phaseState,
      trace,
      contextTokens.length,
    )
    applyMicroVizPhase(this.renderContext, phaseState)
    if (this.lastCameraPoseId !== phaseState.cameraPoseId) {
      this.renderContext.camera.desiredCamera =
        this.renderContext.layout.cameraPoses[phaseState.cameraPoseId]
      this.lastCameraPoseId = phaseState.cameraPoseId
    }
    this.markDirty()
  }

  private markDirty = () => {
    if (this.stopped) {
      return
    }
    if (!this.rafHandle) {
      this.prevTime = performance.now()
      this.rafHandle = requestAnimationFrame(this.loop)
    }
  }

  private loop = (time: number) => {
    this.rafHandle = 0
    if (this.stopped || !this.phaseState) {
      return
    }
    let dt = time - this.prevTime
    this.prevTime = time
    if (dt < 8) {
      dt = 16
    }
    this.render(time, dt)

    if (this.renderContext.camera.desiredCameraTransition) {
      this.markDirty()
    }
  }

  private render(time: number, dt: number) {
    const { renderState, camera, layout } = this.renderContext

    if (this.canvasSizeDirty) {
      const bounds = this.canvasEl.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      this.canvasEl.width = Math.max(1, Math.round(bounds.width * scale))
      this.canvasEl.height = Math.max(1, Math.round(bounds.height * scale))
      renderState.size = new Vec3(bounds.width, bounds.height)
      this.canvasSizeDirty = false
    }

    const view = {
      time,
      dt,
      markDirty: this.markDirty,
    }

    updateCamera({ camera } as never, view)
    genModelViewMatrices(
      {
        camera,
        render: renderState,
      } as never,
      layout as never,
    )
    resetRenderBuffers(renderState)
    drawMicroVizEdges(this.renderContext, this.phaseState!)
    drawBlockInfo({
      render: renderState,
      layout: layout as never,
      camera,
    } as never)
    renderModel({
      render: renderState,
      layout: layout as never,
      camera,
      examples: [],
    } as never)
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function pickProjectedFocus(
  scene: ProjectedScene,
  point: { x: number; y: number },
) {
  for (const node of scene.nodes) {
    const { bounds } = node
    if (
      point.x >= bounds.minX &&
      point.x <= bounds.maxX &&
      point.y >= bounds.minY &&
      point.y <= bounds.maxY
    ) {
      return node.id
    }
  }

  for (const edge of scene.edges) {
    const dx = edge.end.x - edge.start.x
    const dy = edge.end.y - edge.start.y
    const lengthSquared = dx * dx + dy * dy
    if (lengthSquared === 0) {
      continue
    }
    const t = clamp(
      ((point.x - edge.start.x) * dx + (point.y - edge.start.y) * dy) /
        lengthSquared,
      0,
      1,
    )
    const px = edge.start.x + t * dx
    const py = edge.start.y + t * dy
    if (Math.hypot(point.x - px, point.y - py) < 10) {
      return edge.id
    }
  }

  return null
}

function heatColor(
  value: number,
  minValue: number,
  maxValue: number,
  scale: TensorSurface['colorScale'] | VectorStripOverlay['colorScale'],
) {
  if (scale === 'sequential') {
    const ratio = clamp((value - minValue) / (maxValue - minValue + 1e-6), 0, 1)
    return `rgba(97, 175, 239, ${0.16 + ratio * 0.84})`
  }

  const pivot = Math.max(Math.abs(minValue), Math.abs(maxValue), 1e-6)
  const ratio = clamp(Math.abs(value) / pivot, 0, 1)
  if (value >= 0) {
    return `rgba(97, 175, 239, ${0.18 + ratio * 0.82})`
  }
  return `rgba(224, 108, 117, ${0.18 + ratio * 0.82})`
}

function TensorSurfaceView({
  surface,
  onFocusRanges,
  focusRanges,
}: {
  surface: TensorSurface
  onFocusRanges: (ranges: LineRange[] | null) => void
  focusRanges: LineRange[]
}) {
  return (
    <section
      className="tensor-surface"
      onMouseEnter={() => onFocusRanges(focusRanges)}
      onMouseLeave={() => onFocusRanges(null)}
    >
      <div className="tensor-surface__header">
        <strong>{surface.label}</strong>
        <span>
          {surface.rows} × {surface.cols}
        </span>
      </div>
      <div className="tensor-surface__scroll">
        <div
          className="tensor-surface__col-labels"
          style={{ gridTemplateColumns: `repeat(${surface.cols}, minmax(8px, 1fr))` }}
        >
          {surface.colLabels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="tensor-surface__rows">
          {Array.from({ length: surface.rows }, (_, rowIndex) => {
            const row = surface.data.slice(
              rowIndex * surface.cols,
              rowIndex * surface.cols + surface.cols,
            )
            const highlighted = surface.highlightedRows?.includes(rowIndex)
            return (
              <div
                className={`tensor-surface__row ${highlighted ? 'is-highlighted' : ''}`}
                key={`${surface.id}-${rowIndex}`}
              >
                <span className="tensor-surface__row-label">
                  {surface.rowLabels[rowIndex] ?? rowIndex}
                </span>
                <div
                  className="tensor-surface__cells"
                  style={{
                    gridTemplateColumns: `repeat(${surface.cols}, minmax(8px, 1fr))`,
                  }}
                >
                  {row.map((value, colIndex) => {
                    const highlightedCell = surface.highlightedCells?.some(
                      (cell) => cell.row === rowIndex && cell.col === colIndex,
                    )
                    return (
                      <span
                        className={`tensor-surface__cell ${highlightedCell ? 'is-highlighted' : ''}`}
                        key={`${surface.id}-${rowIndex}-${colIndex}`}
                        style={{
                          backgroundColor: heatColor(
                            value,
                            surface.minValue,
                            surface.maxValue,
                            surface.colorScale,
                          ),
                        }}
                        title={`${surface.rowLabels[rowIndex] ?? rowIndex}, ${
                          surface.colLabels[colIndex] ?? colIndex
                        }: ${value.toFixed(4)}`}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function VectorStripView({
  vector,
  onFocusRanges,
  focusRanges,
}: {
  vector: VectorStripOverlay
  onFocusRanges: (ranges: LineRange[] | null) => void
  focusRanges: LineRange[]
}) {
  return (
    <section
      className="tensor-vector"
      onMouseEnter={() => onFocusRanges(focusRanges)}
      onMouseLeave={() => onFocusRanges(null)}
    >
      <div className="tensor-vector__header">
        <strong>{vector.label}</strong>
        <span>{vector.values.length} dims</span>
      </div>
      <div
        className="tensor-vector__cells"
        style={{
          gridTemplateColumns: `repeat(${vector.values.length}, minmax(10px, 1fr))`,
        }}
      >
        {vector.values.map((value, index) => (
          <div className="tensor-vector__item" key={`${vector.id}-${index}`}>
            <span>{vector.itemLabels[index] ?? index}</span>
            <span
              className={`tensor-vector__cell ${
                vector.highlightedIndices?.includes(index) ? 'is-highlighted' : ''
              }`}
              style={{
                backgroundColor: heatColor(
                  value,
                  vector.minValue,
                  vector.maxValue,
                  vector.colorScale,
                ),
              }}
              title={`${vector.itemLabels[index] ?? index}: ${value.toFixed(4)}`}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function AttentionOverlayView({
  overlay,
  onFocusRanges,
  focusRanges,
}: {
  overlay: AttentionGridOverlay
  onFocusRanges: (ranges: LineRange[] | null) => void
  focusRanges: LineRange[]
}) {
  return (
    <div className="scene-focus-window__attention-head">
      <div className="scene-focus-window__attention-label">
        <strong>{overlay.headLabel}</strong>
      </div>
      <TensorSurfaceView
        surface={overlay.surface}
        onFocusRanges={onFocusRanges}
        focusRanges={focusRanges}
      />
      <VectorStripView
        vector={overlay.result}
        onFocusRanges={onFocusRanges}
        focusRanges={focusRanges}
      />
    </div>
  )
}

function getFocusWindowStyle(
  focusWindow: SceneFocusWindow,
  node: ProjectedNode | undefined,
  viewport: ViewportSize,
) {
  const width = Math.min(420, Math.max(280, viewport.width * 0.46))
  const maxLeft = Math.max(18, viewport.width - width - 18)
  const defaultTop = Math.min(viewport.height - 220, 28)

  if (!node) {
    return { left: 18, top: defaultTop, width }
  }

  const rightLeft = clamp(node.bounds.maxX + 18, 18, maxLeft)
  const leftLeft = clamp(node.bounds.minX - width - 18, 18, maxLeft)
  const centerLeft = clamp(
    node.bounds.minX + node.bounds.maxX / 2 - width / 2,
    18,
    maxLeft,
  )
  const defaultTopClamped = clamp(node.bounds.minY - 20, 18, viewport.height - 220)

  switch (focusWindow.placement) {
    case 'left':
      return { left: leftLeft, top: defaultTopClamped, width }
    case 'below':
      return {
        left: clamp(node.bounds.minX, 18, maxLeft),
        top: clamp(node.bounds.maxY + 18, 18, viewport.height - 220),
        width,
      }
    case 'center':
      return { left: centerLeft, top: defaultTopClamped, width }
    case 'right':
    default:
      return { left: rightLeft, top: defaultTopClamped, width }
  }
}

function renderSlots(
  slots: ContextOverlaySlot[],
  projectedScene: ProjectedScene,
) {
  const contextNode = projectedScene.nodeMap.context
  if (!contextNode) {
    return null
  }

  return (
    <div className="scene-overlay-group">
      {slots.map((slot, index) => {
        const ratio = (index + 0.5) / slots.length
        const left =
          contextNode.bounds.minX +
          (contextNode.bounds.maxX - contextNode.bounds.minX) * ratio
        const top = contextNode.bounds.minY + 18
        return (
          <div
            className={`scene-slot-chip ${slot.isCurrent ? 'is-current' : ''}`}
            key={slot.label}
            style={{
              left,
              top,
              transform: 'translate(-50%, 0)',
              opacity: 0.48 + slot.emphasis * 0.52,
            }}
          >
            <strong>{slot.label}</strong>
            <span>{slot.isCurrent ? 'current' : 'visible'}</span>
          </div>
        )
      })}
    </div>
  )
}

function renderFallbackScene(
  projectedScene: ProjectedScene,
  overlay: VizOverlay,
  phase: PhaseDefinition,
  onFocusRanges: (ranges: LineRange[] | null) => void,
) {
  return (
    <svg
      className="scene-panel__canvas"
      data-testid="fallback-scene"
      viewBox="0 0 760 1280"
      onMouseEnter={() => onFocusRanges(phase.codeRanges)}
      onMouseLeave={() => onFocusRanges(null)}
    >
      {projectedScene.edges.map((edge) => (
        <line
          key={edge.id}
          x1={edge.start.x}
          y1={edge.start.y}
          x2={edge.end.x}
          y2={edge.end.y}
          stroke={
            overlay.focusWindow.anchorNodeId === edge.from ||
            overlay.focusWindow.anchorNodeId === edge.to
              ? 'rgba(97,175,239,0.95)'
              : 'rgba(88,101,124,0.35)'
          }
          strokeWidth={overlay.focusWindow.anchorNodeId === edge.from ? 5 : 2}
        />
      ))}
      {projectedScene.nodes.map((node) => {
        const active = overlay.focusWindow.anchorNodeId === node.id
        return (
          <g key={node.id}>
            <polygon
              points={node.top.map(([x, y]) => `${x},${y}`).join(' ')}
              fill={active ? '#7ab7ee' : '#243447'}
            />
            <polygon
              points={node.side.map(([x, y]) => `${x},${y}`).join(' ')}
              fill={active ? '#3e7ab0' : '#1a2431'}
            />
            <polygon
              points={node.front.map(([x, y]) => `${x},${y}`).join(' ')}
              fill={active ? '#4c8fcf' : '#1e2a37'}
            />
          </g>
        )
      })}
    </svg>
  )
}

export function ArchitectureScene({
  trace,
  phase,
  contextTokens,
  tokenLabel,
  sceneModelData,
  onFocusRanges,
}: ArchitectureSceneProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<MicroVizCanvasController | null>(null)
  const dragStateRef = useRef<{
    pointerId: number
    lastX: number
    lastY: number
  } | null>(null)
  const [renderMode, setRenderMode] = useState<'loading' | 'webgl' | 'fallback'>(
    'loading',
  )
  const [hoverFocusId, setHoverFocusId] = useState<{
    phaseId: PhaseDefinition['id']
    focusId: keyof typeof vizFocusRanges | null
  }>({
    phaseId: phase.id,
    focusId: null,
  })
  const [isDraggingScene, setIsDraggingScene] = useState(false)
  const phaseCameraPose = useMemo(
    () => getCameraPose(phase.viz.cameraPoseId),
    [phase.viz.cameraPoseId],
  )
  const [interactiveOverride, setInteractiveOverride] = useState<{
    cameraPoseId: PhaseDefinition['viz']['cameraPoseId']
    panX: number
    panY: number
    scaleMul: number
  }>({
    cameraPoseId: phase.viz.cameraPoseId,
    panX: 0,
    panY: 0,
    scaleMul: 1,
  })
  const viewportSize = useViewportSize(viewportRef)

  const activeInteractiveOverride = useMemo(
    () =>
      interactiveOverride.cameraPoseId === phase.viz.cameraPoseId
        ? interactiveOverride
        : {
            cameraPoseId: phase.viz.cameraPoseId,
            panX: 0,
            panY: 0,
            scaleMul: 1,
          },
    [interactiveOverride, phase.viz.cameraPoseId],
  )

  const interactivePose = useMemo<CameraPose>(
    () => ({
      panX: phaseCameraPose.panX + activeInteractiveOverride.panX,
      panY: phaseCameraPose.panY + activeInteractiveOverride.panY,
      scale: phaseCameraPose.scale * activeInteractiveOverride.scaleMul,
    }),
    [activeInteractiveOverride, phaseCameraPose],
  )

  const activeHoverFocusId =
    hoverFocusId.phaseId === phase.id ? hoverFocusId.focusId : null

  const vizFrame = useMemo(
    () =>
      buildVizFrame(trace, phase, sceneModelData, contextTokens, tokenLabel),
    [trace, phase, sceneModelData, contextTokens, tokenLabel],
  )

  const abstractLayout = useMemo(
    () => buildMicrogptLayout(sceneModelData.config),
    [sceneModelData.config],
  )

  const projectedScene = useMemo(
    () =>
      projectScene(
        abstractLayout,
        interactivePose,
        viewportSize.width,
        viewportSize.height,
      ),
    [abstractLayout, interactivePose, viewportSize],
  )

  useEffect(() => {
    const canvasNode = canvasRef.current
    if (!canvasNode) {
      return
    }
    const activeCanvas: HTMLCanvasElement = canvasNode

    let cancelled = false
    let resizeObserver: ResizeObserver | null = null
    let supportsWebgl = false
    try {
      supportsWebgl = !!activeCanvas.getContext('webgl2')
    } catch {
      supportsWebgl = false
    }

    if (!supportsWebgl) {
      // This effect owns the external canvas runtime, so it also owns the
      // initial fallback mode when WebGL2 is unavailable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRenderMode('fallback')
      return
    }

    async function bootstrap() {
      try {
        const fontAtlasData = await fetchFontAtlasData()
        if (cancelled) {
          return
        }
        const controller = new MicroVizCanvasController(
          activeCanvas,
          sceneModelData,
          fontAtlasData,
        )
        controllerRef.current = controller
        const ResizeObserverCtor = globalThis.ResizeObserver
        if (ResizeObserverCtor) {
          resizeObserver = new ResizeObserverCtor(() => controller.resize())
          resizeObserver.observe(activeCanvas)
        }
        setRenderMode('webgl')
      } catch {
        setRenderMode('fallback')
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
  }, [sceneModelData])

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) {
      return
    }
    controller.setFrame(sceneModelData, phase, trace, contextTokens, vizFrame)
  }, [phase, trace, contextTokens, sceneModelData, vizFrame])

  useEffect(() => {
    if (!activeHoverFocusId) {
      return
    }
    onFocusRanges(vizFocusRanges[activeHoverFocusId] ?? phase.codeRanges)
  }, [activeHoverFocusId, onFocusRanges, phase.codeRanges])

  function updateHoverFromPoint(clientX: number, clientY: number) {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const bounds = viewport.getBoundingClientRect()
    const x = clientX - bounds.left
    const y = clientY - bounds.top
    setHoverFocusId({
      phaseId: phase.id,
      focusId: pickProjectedFocus(projectedScene, { x, y }) as
        | keyof typeof vizFocusRanges
        | null,
    })
  }

  function applyPanToProjectedPose(deltaX: number, deltaY: number) {
    setInteractiveOverride((prev) => {
      const base =
        prev.cameraPoseId === phase.viz.cameraPoseId
          ? prev
          : {
              cameraPoseId: phase.viz.cameraPoseId,
              panX: 0,
              panY: 0,
              scaleMul: 1,
            }
      const pose = {
        panX: phaseCameraPose.panX + base.panX,
        panY: phaseCameraPose.panY + base.panY,
        scale: phaseCameraPose.scale * base.scaleMul,
      }
      const scale = getProjectedScale(viewportSize.width, viewportSize.height, pose)
      return {
        ...base,
        cameraPoseId: phase.viz.cameraPoseId,
        panX: base.panX + deltaX / Math.max(scale, 0.0001),
        panY: base.panY + deltaY / Math.max(scale, 0.0001),
      }
    })
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }

    const handleWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.scene-focus-window')) {
        return
      }
      controllerRef.current?.zoomByDelta(event.deltaY)
      setInteractiveOverride((prev) => {
        const base =
          prev.cameraPoseId === phase.viz.cameraPoseId
            ? prev
            : {
                cameraPoseId: phase.viz.cameraPoseId,
                panX: 0,
                panY: 0,
                scaleMul: 1,
              }
        const nextScale = clamp(
          (phaseCameraPose.scale * base.scaleMul) / Math.pow(1.0013, event.deltaY),
          0.28,
          2.4,
        )
        return {
          ...base,
          cameraPoseId: phase.viz.cameraPoseId,
          scaleMul: nextScale / phaseCameraPose.scale,
        }
      })
      event.preventDefault()
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [phase.viz.cameraPoseId, phaseCameraPose.scale])

  const handleViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('.scene-focus-window')) {
      return
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    }
    setIsDraggingScene(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (dragState && dragState.pointerId === event.pointerId) {
      const deltaX = event.clientX - dragState.lastX
      const deltaY = event.clientY - dragState.lastY
      dragState.lastX = event.clientX
      dragState.lastY = event.clientY
      controllerRef.current?.panByPixels(deltaX, deltaY)
      applyPanToProjectedPose(deltaX, deltaY)
      event.preventDefault()
      return
    }

    updateHoverFromPoint(event.clientX, event.clientY)
  }

  const stopViewportDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current && event) {
      try {
        event.currentTarget.releasePointerCapture(dragStateRef.current.pointerId)
      } catch {
        // No-op if the pointer was already released.
      }
    }
    dragStateRef.current = null
    setIsDraggingScene(false)
  }

  const handleViewportDoubleClick = (
    event: ReactMouseEvent<HTMLDivElement, MouseEvent>,
  ) => {
    const target = event.target as HTMLElement
    if (target.closest('.scene-focus-window')) {
      return
    }
    controllerRef.current?.resetToCameraPose(phase.viz.cameraPoseId)
    setInteractiveOverride({
      cameraPoseId: phase.viz.cameraPoseId,
      panX: 0,
      panY: 0,
      scaleMul: 1,
    })
  }

  const sampledToken = tokenLabel(trace.sampledTokenId)
  const transitionLabel = `p${trace.positionId}:${tokenLabel(trace.tokenId)} -> p${
    trace.positionId + 1
  }:${sampledToken === 'BOS' ? 'stop' : sampledToken}`

  const focusNode = projectedScene.nodeMap[vizFrame.overlay.focusWindow.anchorNodeId]
  const focusWindowStyle = getFocusWindowStyle(
    vizFrame.overlay.focusWindow,
    focusNode,
    viewportSize,
  )
  const overlayWithSlots =
    vizFrame.overlay.kind === 'context-cache' ||
    vizFrame.overlay.kind === 'embedding-lookup' ||
    vizFrame.overlay.kind === 'projection' ||
    vizFrame.overlay.kind === 'attention-scores' ||
    vizFrame.overlay.kind === 'attention-weights' ||
    vizFrame.overlay.kind === 'attention-mix'
      ? vizFrame.overlay.slots
      : null

  return (
    <section
      className="scene-panel"
      aria-label="Architecture scene"
      onMouseEnter={() => onFocusRanges(phase.codeRanges)}
      onMouseLeave={() => {
        setHoverFocusId({ phaseId: phase.id, focusId: null })
        onFocusRanges(null)
      }}
    >
      <div className="scene-panel__header">
        <div>
          <p className="eyebrow">microgpt scene</p>
          <h2>{phase.title}</h2>
        </div>
        <div className="scene-panel__meta">
          <span>microgpt</span>
          <span>{transitionLabel}</span>
          <span>
            {sceneModelData.config.nLayer} layer · {sceneModelData.config.nHead} heads · 4,192
            params
          </span>
        </div>
      </div>

      <div
        className="scene-panel__viewport"
        data-testid="scene-viewport"
        ref={viewportRef}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={stopViewportDrag}
        onPointerCancel={stopViewportDrag}
        onPointerLeave={(event) => {
          stopViewportDrag(event)
          setHoverFocusId({ phaseId: phase.id, focusId: null })
        }}
        onDoubleClick={handleViewportDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
        style={{ cursor: isDraggingScene ? 'grabbing' : 'grab' }}
      >
        {renderMode === 'fallback' ? (
          renderFallbackScene(projectedScene, vizFrame.overlay, phase, onFocusRanges)
        ) : (
          <canvas
            className="scene-panel__canvas"
            data-testid={renderMode === 'loading' ? 'scene-loading' : undefined}
            ref={canvasRef}
          />
        )}

        <div className="scene-panel__overlay-layer">
          {overlayWithSlots ? renderSlots(overlayWithSlots, projectedScene) : null}
          <div className="scene-panel__interaction-hint">
            drag to pan · wheel to zoom · double click to reset
          </div>

          <div className="scene-focus-window" style={focusWindowStyle}>
            <div className="scene-focus-window__header">
              <div>
                <strong>{vizFrame.overlay.focusWindow.title}</strong>
                <p className="scene-focus-window__subtitle">
                  {vizFrame.overlay.focusWindow.subtitle}
                </p>
              </div>
              <span>{transitionLabel}</span>
            </div>

            {vizFrame.overlay.focusWindow.lookups?.length ? (
              <div className="scene-focus-window__lookups">
                {vizFrame.overlay.focusWindow.lookups.map((lookup) => (
                  <div
                    className="scene-focus-window__lookup"
                    key={`${vizFrame.overlay.focusWindow.id}-${lookup.label}`}
                    onMouseEnter={() => onFocusRanges(phase.codeRanges)}
                    onMouseLeave={() => onFocusRanges(null)}
                  >
                    <strong>{lookup.label}</strong>
                    <span>{lookup.description}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {vizFrame.overlay.focusWindow.projection ? (
              <div className="scene-focus-window__projection">
                <strong>{vizFrame.overlay.focusWindow.projection.equation}</strong>
                <VectorStripView
                  vector={vizFrame.overlay.focusWindow.projection.input}
                  onFocusRanges={onFocusRanges}
                  focusRanges={phase.codeRanges}
                />
                <div className="scene-focus-window__projection-outputs">
                  {vizFrame.overlay.focusWindow.projection.outputs.map((vector) => (
                    <VectorStripView
                      key={vector.id}
                      vector={vector}
                      onFocusRanges={onFocusRanges}
                      focusRanges={phase.codeRanges}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {vizFrame.overlay.focusWindow.attention?.length ? (
              <div className="scene-focus-window__attention">
                {vizFrame.overlay.focusWindow.attention.map((attention) => (
                  <AttentionOverlayView
                    key={attention.headLabel}
                    overlay={attention}
                    onFocusRanges={onFocusRanges}
                    focusRanges={phase.codeRanges}
                  />
                ))}
              </div>
            ) : null}

            {vizFrame.overlay.focusWindow.surfaces.length ? (
              <div className="scene-focus-window__surfaces">
                {vizFrame.overlay.focusWindow.surfaces.map((surface) => (
                  <TensorSurfaceView
                    key={surface.id}
                    surface={surface}
                    onFocusRanges={onFocusRanges}
                    focusRanges={phase.codeRanges}
                  />
                ))}
              </div>
            ) : null}

            {vizFrame.overlay.focusWindow.vectors.length ? (
              <div className="scene-focus-window__vectors">
                {vizFrame.overlay.focusWindow.vectors.map((vector) => (
                  <VectorStripView
                    key={vector.id}
                    vector={vector}
                    onFocusRanges={onFocusRanges}
                    focusRanges={phase.codeRanges}
                  />
                ))}
              </div>
            ) : null}

            {vizFrame.overlay.focusWindow.note ? (
              <p
                className="scene-focus-window__note"
                onMouseEnter={() => onFocusRanges(phase.codeRanges)}
                onMouseLeave={() => onFocusRanges(null)}
              >
                {vizFrame.overlay.focusWindow.note}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
