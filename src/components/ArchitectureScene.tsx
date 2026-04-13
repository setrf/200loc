import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { TokenStepTrace } from '../model'
import { buildVizFrame } from '../viz/llmViz/frame'
import {
  buildMicrogptLayout,
  getCameraPose,
  getNodeFrontLabelPosition,
  getNodeSubtitlePosition,
  projectScene,
} from '../viz/llmViz/layout'
import { getPickFocusId, VizRenderer } from '../viz/llmViz/renderer'
import type {
  ProjectedScene,
  SceneFocusWindow,
  SceneModelData,
  TensorSurface,
  VectorStripOverlay,
  VizFrame,
} from '../viz/llmViz/types'
import {
  inferencePhases,
  type LineRange,
  type PhaseDefinition,
  trainingAppendix,
  vizFocusRanges,
} from '../walkthrough/phases'

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

const defaultViewportSize: ViewportSize = {
  width: 760,
  height: 820,
}

function useViewportSize(elementRef: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState<ViewportSize>(defaultViewportSize)

  useEffect(() => {
    const element = elementRef.current!

    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.max(420, Math.round(rect.width || defaultViewportSize.width)),
        height: Math.max(520, Math.round(rect.height || defaultViewportSize.height)),
      })
    }

    update()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update)
      observer.observe(element)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [elementRef])

  return size
}

function overlayPosition(x: number, y: number, translate = '-50%, -50%') {
  return {
    left: `${x}px`,
    top: `${y}px`,
    transform: `translate(${translate})`,
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getHeatColor(
  value: number,
  minValue: number,
  maxValue: number,
  colorScale: 'diverging' | 'sequential',
  highlighted: boolean,
) {
  if (colorScale === 'sequential') {
    const range = Math.max(1e-6, maxValue - minValue)
    const normalized = clamp((value - minValue) / range, 0, 1)
    const alpha = 0.18 + normalized * 0.82
    return {
      background: `rgba(97, 175, 239, ${alpha.toFixed(3)})`,
      borderColor: highlighted
        ? 'rgba(229, 237, 245, 0.92)'
        : `rgba(142, 200, 255, ${(0.18 + normalized * 0.34).toFixed(3)})`,
    }
  }

  const maxAbs = Math.max(Math.abs(minValue), Math.abs(maxValue), 1e-6)
  const normalized = clamp(Math.abs(value) / maxAbs, 0, 1)
  const alpha = 0.14 + normalized * 0.8

  if (value >= 0) {
    return {
      background: `rgba(97, 175, 239, ${alpha.toFixed(3)})`,
      borderColor: highlighted
        ? 'rgba(229, 237, 245, 0.92)'
        : `rgba(97, 175, 239, ${(0.16 + normalized * 0.4).toFixed(3)})`,
    }
  }

  return {
    background: `rgba(246, 193, 119, ${alpha.toFixed(3)})`,
    borderColor: highlighted
      ? 'rgba(229, 237, 245, 0.92)'
      : `rgba(246, 193, 119, ${(0.16 + normalized * 0.4).toFixed(3)})`,
  }
}

function getFocusWindowStyle(
  focusWindow: SceneFocusWindow,
  projected: ProjectedScene,
  size: ViewportSize,
) {
  const anchor = projected.nodeMap[focusWindow.anchorNodeId]
  const maxWidth = Math.min(size.width - 32, focusWindow.placement === 'below' ? 560 : 460)
  const leftAnchor =
    focusWindow.placement === 'left'
      ? anchor.bounds.minX - maxWidth - 20
      : focusWindow.placement === 'center'
        ? anchor.center.x - maxWidth / 2
        : focusWindow.placement === 'below'
          ? anchor.center.x - maxWidth / 2
          : anchor.bounds.maxX + 20
  const topAnchor =
    focusWindow.placement === 'below'
      ? anchor.bounds.maxY + 20
      : focusWindow.placement === 'center'
        ? anchor.center.y - 160
        : anchor.bounds.minY - 10

  return {
    left: `${clamp(leftAnchor, 16, size.width - maxWidth - 16)}px`,
    top: `${clamp(topAnchor, 16, size.height - 260)}px`,
    width: `${maxWidth}px`,
  }
}

function cellIsHighlighted(surface: TensorSurface, row: number, col: number) {
  return !!(
    surface.highlightedRows?.includes(row) ||
    surface.highlightedCols?.includes(col) ||
    surface.highlightedCells?.some((cell) => cell.row === row && cell.col === col)
  )
}

function TensorSurfaceView({
  surface,
  onFocusRanges,
  ranges,
}: {
  surface: TensorSurface
  onFocusRanges: (ranges: LineRange[] | null) => void
  ranges: LineRange[]
}) {
  return (
    <section
      className="tensor-surface"
      data-testid={`tensor-surface-${surface.id}`}
      onMouseEnter={() => onFocusRanges(ranges)}
      onMouseLeave={() => onFocusRanges(null)}
    >
      <header className="tensor-surface__header">
        <strong>{surface.label}</strong>
        <span>
          {surface.rows}x{surface.cols}
        </span>
      </header>
      <div className="tensor-surface__scroll">
        <div
          className="tensor-surface__col-labels"
          style={{ gridTemplateColumns: `repeat(${surface.cols}, minmax(8px, 1fr))` }}
        >
          {surface.colLabels.map((label, index) => (
            <span key={`${surface.id}-col-${index}`}>{label}</span>
          ))}
        </div>
        <div className="tensor-surface__rows">
          {Array.from({ length: surface.rows }, (_, row) => {
            const offset = row * surface.cols
            const rowData = surface.data.slice(offset, offset + surface.cols)
            const rowHighlighted = surface.highlightedRows?.includes(row)
            return (
              <div
                className={`tensor-surface__row ${rowHighlighted ? 'is-highlighted' : ''}`}
                key={`${surface.id}-row-${row}`}
              >
                <span className="tensor-surface__row-label">
                  {surface.rowLabels[row] ?? `r${row}`}
                </span>
                <div
                  className="tensor-surface__cells"
                  style={{
                    gridTemplateColumns: `repeat(${surface.cols}, minmax(8px, 1fr))`,
                  }}
                >
                  {rowData.map((value, col) => {
                    const highlighted = cellIsHighlighted(surface, row, col)
                    const color = getHeatColor(
                      value,
                      surface.minValue,
                      surface.maxValue,
                      surface.colorScale,
                      highlighted,
                    )

                    return (
                      <div
                        className={`tensor-surface__cell ${
                          highlighted ? 'is-highlighted' : ''
                        }`}
                        key={`${surface.id}-cell-${row}-${col}`}
                        style={color}
                        title={`${surface.rowLabels[row] ?? `r${row}`} / ${
                          surface.colLabels[col] ?? `c${col}`
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
  ranges,
}: {
  vector: VectorStripOverlay
  onFocusRanges: (ranges: LineRange[] | null) => void
  ranges: LineRange[]
}) {
  return (
    <section
      className="tensor-vector"
      data-testid={`tensor-vector-${vector.id}`}
      onMouseEnter={() => onFocusRanges(ranges)}
      onMouseLeave={() => onFocusRanges(null)}
    >
      <header className="tensor-vector__header">
        <strong>{vector.label}</strong>
        <span>{vector.values.length}d</span>
      </header>
      <div
        className="tensor-vector__cells"
        style={{
          gridTemplateColumns: `repeat(${vector.values.length}, minmax(8px, 1fr))`,
        }}
      >
        {vector.values.map((value, index) => {
          const highlighted = vector.highlightedIndices?.includes(index) ?? false
          const color = getHeatColor(
            value,
            vector.minValue,
            vector.maxValue,
            vector.colorScale,
            highlighted,
          )
          return (
            <div className="tensor-vector__item" key={`${vector.id}-${index}`}>
              <span>{vector.itemLabels[index] ?? `d${index}`}</span>
              <div
                className={`tensor-vector__cell ${highlighted ? 'is-highlighted' : ''}`}
                style={color}
                title={`${vector.itemLabels[index] ?? `d${index}`}: ${value.toFixed(4)}`}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ContextSlotsOverlay({
  projected,
  frame,
}: {
  projected: ProjectedScene
  frame: VizFrame
}) {
  if (
    frame.overlay.kind !== 'context-cache' &&
    frame.overlay.kind !== 'embedding-lookup' &&
    frame.overlay.kind !== 'projection' &&
    frame.overlay.kind !== 'attention-scores' &&
    frame.overlay.kind !== 'attention-weights' &&
    frame.overlay.kind !== 'attention-mix'
  ) {
    return null
  }

  const node = projected.nodeMap.context
  const slots = frame.overlay.slots

  return (
    <div className="scene-overlay-group scene-overlay-group--context">
      {slots.map((slot, index) => {
        const x =
          node.bounds.minX +
          ((index + 0.5) / Math.max(1, slots.length)) *
            (node.bounds.maxX - node.bounds.minX)
        const y = node.bounds.minY + 18
        return (
          <div
            className={`scene-slot-chip ${slot.isCurrent ? 'is-current' : ''}`}
            key={slot.label}
            style={overlayPosition(x, y)}
          >
            <span>{slot.label}</span>
            {slot.emphasis > 0 ? <strong>{Math.round(slot.emphasis * 100)}%</strong> : null}
          </div>
        )
      })}
    </div>
  )
}

function FocusWindow({
  projected,
  frame,
  phase,
  size,
  onFocusRanges,
}: {
  projected: ProjectedScene
  frame: VizFrame
  phase: PhaseDefinition
  size: ViewportSize
  onFocusRanges: (ranges: LineRange[] | null) => void
}) {
  const focusWindow = frame.overlay.focusWindow
  const style = getFocusWindowStyle(focusWindow, projected, size)

  return (
    <div
      className="scene-focus-window"
      data-testid="scene-focus-window"
      style={style}
      onMouseEnter={() => onFocusRanges(phase.codeRanges)}
      onMouseLeave={() => onFocusRanges(null)}
    >
      <div className="scene-focus-window__header">
        <div>
          <p className="eyebrow">Active tensor window</p>
          <h3>{focusWindow.title}</h3>
        </div>
        <span>{focusWindow.anchorNodeId}</span>
      </div>
      <p className="scene-focus-window__subtitle">{focusWindow.subtitle}</p>

      {focusWindow.lookups?.length ? (
        <div className="scene-focus-window__lookups">
          {focusWindow.lookups.map((lookup) => (
            <div className="scene-focus-window__lookup" key={lookup.label}>
              <strong>{lookup.label}</strong>
              <span>{lookup.description}</span>
            </div>
          ))}
        </div>
      ) : null}

      {focusWindow.projection ? (
        <div className="scene-focus-window__projection">
          <strong>{focusWindow.projection.equation}</strong>
          <VectorStripView
            vector={focusWindow.projection.input}
            onFocusRanges={onFocusRanges}
            ranges={phase.codeRanges}
          />
          <div className="scene-focus-window__projection-outputs">
            {focusWindow.projection.outputs.map((vector) => (
              <VectorStripView
                key={vector.id}
                vector={vector}
                onFocusRanges={onFocusRanges}
                ranges={phase.codeRanges}
              />
            ))}
          </div>
        </div>
      ) : null}

      {focusWindow.attention?.length ? (
        <div className="scene-focus-window__attention">
          {focusWindow.attention.map((item) => (
            <div className="scene-focus-window__attention-head" key={item.headLabel}>
              <div className="scene-focus-window__attention-label">
                <strong>{item.headLabel}</strong>
              </div>
              <TensorSurfaceView
                surface={item.surface}
                onFocusRanges={onFocusRanges}
                ranges={phase.codeRanges}
              />
              <VectorStripView
                vector={item.result}
                onFocusRanges={onFocusRanges}
                ranges={phase.codeRanges}
              />
            </div>
          ))}
        </div>
      ) : null}

      {focusWindow.surfaces.length ? (
        <div className="scene-focus-window__surfaces">
          {focusWindow.surfaces.map((surface) => (
            <TensorSurfaceView
              key={surface.id}
              surface={surface}
              onFocusRanges={onFocusRanges}
              ranges={phase.codeRanges}
            />
          ))}
        </div>
      ) : null}

      {focusWindow.vectors.length ? (
        <div className="scene-focus-window__vectors">
          {focusWindow.vectors.map((vector) => (
            <VectorStripView
              key={vector.id}
              vector={vector}
              onFocusRanges={onFocusRanges}
              ranges={phase.codeRanges}
            />
          ))}
        </div>
      ) : null}

      {focusWindow.note ? <p className="scene-focus-window__note">{focusWindow.note}</p> : null}
    </div>
  )
}

function renderNodeLabels(projected: ProjectedScene) {
  return projected.nodes.map((node) => {
    const label = getNodeFrontLabelPosition(node)
    const subtitle = getNodeSubtitlePosition(node)
    return (
      <div className="scene-node-label" key={node.id}>
        <span style={overlayPosition(label.x, label.y, '0, 0')}>{node.label}</span>
        <small style={overlayPosition(subtitle.x, subtitle.y, '0, 0')}>
          {node.subtitle}
        </small>
      </div>
    )
  })
}

export function ArchitectureScene({
  trace,
  phase,
  contextTokens,
  tokenLabel,
  sceneModelData,
  onFocusRanges,
}: ArchitectureSceneProps) {
  const layout = useMemo(
    () => buildMicrogptLayout(sceneModelData.config),
    [sceneModelData.config],
  )
  const frame = useMemo(
    () => buildVizFrame(trace, phase, sceneModelData, contextTokens, tokenLabel),
    [contextTokens, phase, sceneModelData, tokenLabel, trace],
  )
  const sceneRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<VizRenderer | null>(null)
  const size = useViewportSize(sceneRef)
  const [renderMode, setRenderMode] = useState<'webgl2' | 'projected-2d'>(
    'projected-2d',
  )
  const projected = useMemo(
    () =>
      projectScene(
        layout,
        getCameraPose(frame.cameraPoseId),
        size.width,
        size.height,
      ),
    [frame.cameraPoseId, layout, size.height, size.width],
  )

  useEffect(() => {
    const canvas = canvasRef.current!

    const renderer = new VizRenderer()
    rendererRef.current = renderer
    const mountResult = renderer.mount(canvas, layout)
    setRenderMode(mountResult.mode)

    return () => {
      renderer.dispose()
      rendererRef.current = null
    }
  }, [layout])

  useEffect(() => {
    rendererRef.current?.resize(size.width, size.height)
  }, [size.height, size.width])

  useEffect(() => {
    rendererRef.current?.setFrame(frame)
  }, [frame])

  const phaseIndex = inferencePhases.findIndex((item) => item.id === phase.id)

  return (
    <section className="scene-panel" aria-label="Architecture scene">
      <div className="scene-panel__header">
        <div>
          <p className="eyebrow">Model path</p>
          <h2>microgpt architecture</h2>
        </div>
        <div className="scene-panel__meta">
          <span>{renderMode === 'webgl2' ? 'WebGL2 scene' : 'Projected 2D fallback'}</span>
          <span>{frame.transitionLabel}</span>
          <span>phase {phaseIndex + 1} / {inferencePhases.length}</span>
        </div>
      </div>

      <div
        className="scene-panel__viewport"
        data-testid="scene-viewport"
        ref={sceneRef}
        onPointerMove={(event) => {
          const rect = sceneRef.current!.getBoundingClientRect()
          const pick = rendererRef.current?.pick(
            event.clientX - rect.left,
            event.clientY - rect.top,
          )
          onFocusRanges(pick ? vizFocusRanges[getPickFocusId(pick)] : null)
        }}
        onPointerLeave={() => onFocusRanges(null)}
      >
        <canvas
          aria-label="LLM architecture scene"
          className="scene-panel__canvas"
          ref={canvasRef}
        />
        <div className="scene-panel__overlay-layer">
          {renderNodeLabels(projected)}
          <ContextSlotsOverlay projected={projected} frame={frame} />
          <FocusWindow
            projected={projected}
            frame={frame}
            phase={phase}
            size={size}
            onFocusRanges={onFocusRanges}
          />
        </div>
        <div className="scene-panel__legend">
          <strong>{frame.currentSlotLabel}</strong>
          <span>{phase.title}</span>
        </div>
        <button
          className="scene-panel__training-note"
          type="button"
          onMouseEnter={() => onFocusRanges(trainingAppendix[0].codeRanges)}
          onMouseLeave={() => onFocusRanges(null)}
        >
          weights came from offline training
        </button>
      </div>
    </section>
  )
}
