import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import type { TokenStepTrace } from '../model'
import { vizFocusRanges, type LineRange, type PhaseDefinition } from '../walkthrough/phases'
import { buildVizFrame } from '../viz/llmViz/frame'
import { buildMicrogptLayout, getCameraPose, projectScene } from '../viz/llmViz/layout'
import type { ProjectedScene, SceneModelData } from '../viz/llmViz/types'
import {
  MicroLayerView,
  type MicroLayerViewHandle,
} from '../viz/microViz/LayerView'

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

type FocusRangeKey = keyof typeof vizFocusRanges

function useViewportSize<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [size, setSize] = useState<ViewportSize>({ width: 760, height: 760 })

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const update = () => {
      const bounds = element.getBoundingClientRect()
      setSize({
        width: Math.max(320, Math.round(bounds.width)),
        height: Math.max(480, Math.round(bounds.height)),
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function pickProjectedFocus(scene: ProjectedScene, point: { x: number; y: number }) {
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

function renderFallbackScene(
  projectedScene: ProjectedScene,
  phase: PhaseDefinition,
  onFocusRanges: (ranges: LineRange[] | null) => void,
) {
  const activeNodeIds = new Set([
    phase.viz.focusNodeId,
    ...phase.viz.emphasisNodeIds,
  ])
  const activeEdgeIds = new Set(phase.viz.emphasisEdgeIds)

  return (
    <svg
      className="scene-panel__fallback"
      data-testid="fallback-scene"
      viewBox="0 0 760 1200"
      aria-hidden="true"
    >
      {projectedScene.edges.map((edge) => (
        <line
          key={edge.id}
          className={`scene-panel__fallback-edge ${activeEdgeIds.has(edge.id) ? 'is-active' : ''}`}
          x1={edge.start.x}
          x2={edge.end.x}
          y1={edge.start.y}
          y2={edge.end.y}
          onMouseEnter={() => onFocusRanges(phase.codeRanges)}
          onMouseLeave={() => onFocusRanges(null)}
        />
      ))}
      {projectedScene.nodes.map((node) => {
        const active = activeNodeIds.has(node.id)
        return (
          <g
            key={node.id}
            className={`scene-panel__fallback-node ${active ? 'is-active' : ''}`}
            onMouseEnter={() => onFocusRanges(phase.codeRanges)}
            onMouseLeave={() => onFocusRanges(null)}
          >
            <polygon points={node.side.map(([x, y]) => `${x},${y}`).join(' ')} />
            <polygon points={node.top.map(([x, y]) => `${x},${y}`).join(' ')} />
            <polygon points={node.front.map(([x, y]) => `${x},${y}`).join(' ')} />
            <text x={node.bounds.minX} y={node.bounds.minY - 6}>
              {node.label}
            </text>
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
  const layerViewRef = useRef<MicroLayerViewHandle | null>(null)
  const [renderMode, setRenderMode] = useState<'loading' | 'webgl' | 'fallback'>(
    'loading',
  )
  const [hoverFocusId, setHoverFocusId] = useState<{
    phaseId: string
    focusId: FocusRangeKey | null
  }>({ phaseId: phase.id, focusId: null })
  const viewportSize = useViewportSize(viewportRef)

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
        getCameraPose(vizFrame.cameraPoseId),
        viewportSize.width,
        viewportSize.height,
      ),
    [abstractLayout, viewportSize, vizFrame.cameraPoseId],
  )

  const handleLayerHoverChange = useCallback(
    (focusId: FocusRangeKey | null) => {
      setHoverFocusId({
        phaseId: phase.id,
        focusId,
      })
    },
    [phase.id],
  )

  const updateHoverFromPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (renderMode !== 'fallback' || !viewportRef.current) {
        return
      }
      const bounds = viewportRef.current.getBoundingClientRect()
      const focusId = pickProjectedFocus(projectedScene, {
        x: clientX - bounds.left,
        y: clientY - bounds.top,
      })
      if (!focusId) {
        setHoverFocusId({ phaseId: phase.id, focusId: null })
        return
      }
      const nextFocusId =
        focusId in vizFocusRanges ? (focusId as FocusRangeKey) : null
      setHoverFocusId({ phaseId: phase.id, focusId: nextFocusId })
    },
    [phase.id, projectedScene, renderMode],
  )

  useEffect(() => {
    const activeFocusId =
      hoverFocusId.phaseId === phase.id ? hoverFocusId.focusId : null
    if (activeFocusId) {
      onFocusRanges(vizFocusRanges[activeFocusId])
      return
    }
    onFocusRanges(null)
  }, [hoverFocusId, onFocusRanges, phase.id])

  const handleViewportDoubleClick = () => {
    layerViewRef.current?.resetToCameraPose(phase.viz.cameraPoseId)
  }

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
      <div
        className="scene-panel__viewport"
        data-testid="scene-viewport"
        ref={viewportRef}
        onMouseMove={(event) => updateHoverFromPoint(event.clientX, event.clientY)}
        onMouseLeave={() => setHoverFocusId({ phaseId: phase.id, focusId: null })}
        onDoubleClick={handleViewportDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      >
        {renderMode === 'fallback' ? (
          renderFallbackScene(projectedScene, phase, onFocusRanges)
        ) : (
          <MicroLayerView
            ref={layerViewRef}
            phase={phase}
            trace={trace}
            contextTokens={contextTokens}
            vizFrame={vizFrame}
            sceneModelData={sceneModelData}
            onHoverFocusChange={handleLayerHoverChange}
            onRenderModeChange={setRenderMode}
          />
        )}

        <div className="scene-panel__overlay-layer">
          <div className="scene-panel__interaction-hint">
            drag to pan · wheel to zoom · double click to reset
          </div>
          {renderMode === 'loading' ? (
            <div className="scene-panel__loading">loading scene…</div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
