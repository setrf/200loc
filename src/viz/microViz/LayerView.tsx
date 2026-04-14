import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react'
import s from '../../vendor/llmVizOriginal/llm/LayerView.module.scss'
import { CanvasEventSurface } from '../../vendor/llmVizOriginal/llm/CanvasEventSurface'
import { ProgramStateContext } from '../../vendor/llmVizOriginal/llm/Sidebar'
import { useScreenLayout } from '@llmviz/utils/layout'
import {
  KeyboardManagerContext,
  KeyboardOrder,
  useGlobalKeyboard,
} from '../../vendor/llmVizOriginal/utils/keyboard'
import { MovementAction } from '../../vendor/llmVizOriginal/llm/components/MovementControls'
import { vizFocusRanges } from '../../walkthrough/phases'
import type { PhaseDefinition } from '../../walkthrough/phases'
import type { TokenStepTrace } from '../../model'
import type { SceneModelData, VizFrame } from '../llmViz/types'
import {
  initMicroVizProgramState,
  loadMicroVizFontAtlas,
  runMicroVizProgram,
  setMicroVizProgramData,
  type MicroVizProgramData,
  type MicroVizProgramState,
} from './program'
import { Vec3 } from '../../vendor/llmVizOriginal/utils/vector'

type FocusRangeKey = keyof typeof vizFocusRanges

export interface MicroLayerViewHandle {
  resetToCameraPose: (cameraPoseId: PhaseDefinition['viz']['cameraPoseId']) => void
}

interface MicroLayerViewProps {
  phase: PhaseDefinition
  trace: TokenStepTrace
  contextTokens: string[]
  vizFrame: VizFrame
  sceneModelData: SceneModelData
  onHoverFocusChange: (focusId: FocusRangeKey | null) => void
  onRenderModeChange: (mode: 'loading' | 'webgl' | 'fallback') => void
}

interface CanvasData {
  scene: MicroVizProgramData
}

class MicroCanvasRender {
  progState: MicroVizProgramState
  stopped = false
  canvasSizeDirty = true
  isDirty = false
  isWaitingForSync = false
  prevTime = performance.now()
  rafHandle = 0
  private hoverFocusId: FocusRangeKey | null = null
  private blockFocusByIndex: Map<number, FocusRangeKey | null>

  constructor(
    private canvasEl: HTMLCanvasElement,
    private canvasData: CanvasData | null,
    sceneModelData: SceneModelData,
    fontAtlasData: Awaited<ReturnType<typeof loadMicroVizFontAtlas>>,
    private onHoverFocusChange: (focusId: FocusRangeKey | null) => void,
  ) {
    this.progState = initMicroVizProgramState(canvasEl, fontAtlasData, sceneModelData)
    this.progState.markDirty = this.markDirty
    this.blockFocusByIndex = new Map(
      Object.values(this.progState.layout.blocks).map(({ cube, codeFocusId }) => [
        cube.idx,
        codeFocusId && codeFocusId in vizFocusRanges
          ? (codeFocusId as FocusRangeKey)
          : null,
      ]),
    )
  }

  destroy() {
    this.stopped = true
    if (this.rafHandle) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = 0
    }
  }

  resetToCameraPose(cameraPoseId: PhaseDefinition['viz']['cameraPoseId']) {
    this.progState.camera.desiredCamera =
      this.progState.layout.cameraPoses[cameraPoseId]
    this.markDirty()
  }

  setData(data: CanvasData) {
    this.canvasData = data
    setMicroVizProgramData(this.progState, data.scene)
    this.markDirty()
  }

  updatePageLayout(layout: MicroVizProgramState['pageLayout']) {
    this.progState.pageLayout = layout
    this.markDirty()
  }

  setMovementAction(action: MicroVizProgramState['movement']['action']) {
    this.progState.movement.action = action
    this.markDirty()
  }

  markDirty = () => {
    if (!this.canvasData || this.stopped) {
      return
    }
    this.isDirty = true
    if (!this.rafHandle) {
      this.prevTime = performance.now()
      this.rafHandle = requestAnimationFrame(this.loop)
    }
  }

  private loop = (time: number) => {
    if (!(this.isDirty || this.isWaitingForSync) || this.stopped) {
      this.rafHandle = 0
      return
    }

    const wasDirty = this.isDirty
    this.isDirty = false
    this.isWaitingForSync = false

    let dt = time - this.prevTime
    this.prevTime = time
    if (dt < 8) {
      dt = 16
    }

    this.checkSyncObjects()
    const prevSyncCount = this.progState.render.syncObjects.length
    if (wasDirty || this.isDirty) {
      this.render(time, dt)
    }
    const nextSyncCount = this.progState.render.syncObjects.length
    if (nextSyncCount !== prevSyncCount) {
      this.isWaitingForSync = true
    }

    this.rafHandle = requestAnimationFrame(this.loop)
  }

  private checkSyncObjects() {
    const gl = this.progState.render.gl
    const objs = this.progState.render.syncObjects
    let anyToRemove = false

    for (const obj of objs) {
      if (obj.isReady) {
        anyToRemove = true
        continue
      }
      const syncStatus = gl.clientWaitSync(obj.sync, 0, 0)
      if (syncStatus === gl.TIMEOUT_EXPIRED) {
        this.isWaitingForSync = true
      } else {
        obj.isReady = true
        obj.elapsedMs = performance.now() - obj.startTime
        gl.deleteSync(obj.sync)
        anyToRemove = true
      }
    }

    if (anyToRemove) {
      this.progState.render.syncObjects = objs.filter((obj) => !obj.isReady)
      this.markDirty()
    }
  }

  private render(time: number, dt: number) {
    const canvasEl = this.progState.render.canvasEl
    if (this.canvasSizeDirty) {
      const bcr = canvasEl.getBoundingClientRect()
      const scale = window.devicePixelRatio || 1
      canvasEl.width = Math.max(1, Math.round(bcr.width * scale))
      canvasEl.height = Math.max(1, Math.round(bcr.height * scale))
      this.progState.render.size = new Vec3(bcr.width, bcr.height)
      this.canvasSizeDirty = false
    }

    runMicroVizProgram({ time, dt, markDirty: this.markDirty }, this.progState)
    this.progState.htmlSubs.notify()
    this.publishHoverFocus()
  }

  private publishHoverFocus() {
    const hoverTarget = this.progState.display.hoverTarget as
      | { mainCube: { idx: number } }
      | null
    const nextFocusId = hoverTarget
      ? this.blockFocusByIndex.get(hoverTarget.mainCube.idx) ?? null
      : null
    if (nextFocusId === this.hoverFocusId) {
      return
    }
    this.hoverFocusId = nextFocusId
    this.onHoverFocusChange(nextFocusId)
  }
}

export const MicroLayerView = forwardRef<MicroLayerViewHandle, MicroLayerViewProps>(
  function MicroLayerView(
    {
      phase,
      trace,
      contextTokens,
      vizFrame,
      sceneModelData,
      onHoverFocusChange,
      onRenderModeChange,
    },
    ref,
  ) {
    const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
    const [canvasRender, setCanvasRender] = useState<MicroCanvasRender | null>(null)
    const layout = useScreenLayout()
    const keyboardManager = useContext(KeyboardManagerContext)

    const sceneData = useMemo<CanvasData>(
      () => ({
        scene: {
          phase,
          trace,
          contextTokens,
          vizFrame,
        },
      }),
      [contextTokens, phase, trace, vizFrame],
    )

    useGlobalKeyboard(KeyboardOrder.MainPage, (ev: KeyboardEvent) => {
      if (!canvasRender?.progState) {
        return
      }

      const key = ev.key.toLowerCase()
      if (ev.key === 'ArrowLeft' || key === 'a') {
        canvasRender.setMovementAction(MovementAction.Left)
      }
      if (ev.key === 'ArrowRight' || key === 'd') {
        canvasRender.setMovementAction(MovementAction.Right)
      }
      if (ev.key === 'ArrowUp' || key === 'w') {
        canvasRender.setMovementAction(MovementAction.Up)
      }
      if (ev.key === 'ArrowDown' || key === 's') {
        canvasRender.setMovementAction(MovementAction.Down)
      }
      if (ev.key === 'PageUp' || key === 'q') {
        canvasRender.setMovementAction(MovementAction.In)
      }
      if (ev.key === 'PageDown' || key === 'e') {
        canvasRender.setMovementAction(MovementAction.Out)
      }
      if (key === 'r') {
        canvasRender.setMovementAction(MovementAction.Expand)
      }
      if (key === 'f') {
        canvasRender.setMovementAction(MovementAction.Focus)
      }
    })

    useEffect(() => {
      document.addEventListener('keydown', keyboardManager.handleKey)
      document.addEventListener('keyup', keyboardManager.handleKey)
      return () => {
        document.removeEventListener('keydown', keyboardManager.handleKey)
        document.removeEventListener('keyup', keyboardManager.handleKey)
      }
    }, [keyboardManager])

    useImperativeHandle(ref, () => ({
      resetToCameraPose(cameraPoseId) {
        canvasRender?.resetToCameraPose(cameraPoseId)
      },
    }), [canvasRender])

    useEffect(() => {
      if (!canvasEl) {
        return
      }
      const activeCanvas = canvasEl

      let stale = false
      let canvasRenderLocal: MicroCanvasRender | null = null
      let resizeObserver: ResizeObserver | null = null
      const handleWheel = (event: WheelEvent) => event.preventDefault()
      const supportsWebgl = !!activeCanvas.getContext('webgl2')

      if (!supportsWebgl) {
        onRenderModeChange('fallback')
        return
      }

      async function bootstrap() {
        try {
          const fontAtlasData = await loadMicroVizFontAtlas()
          if (stale) {
            return
          }
          canvasRenderLocal = new MicroCanvasRender(
            activeCanvas,
            null,
            sceneModelData,
            fontAtlasData,
            onHoverFocusChange,
          )
          resizeObserver = new ResizeObserver(() => {
            canvasRenderLocal!.canvasSizeDirty = true
            canvasRenderLocal!.markDirty()
          })
          resizeObserver.observe(activeCanvas)
          activeCanvas.addEventListener('wheel', handleWheel, { passive: false })
          setCanvasRender(canvasRenderLocal)
          onRenderModeChange('webgl')
        } catch {
          if (!stale) {
            onRenderModeChange('fallback')
          }
        }
      }

      void bootstrap()

      return () => {
        stale = true
        onRenderModeChange('loading')
        activeCanvas.removeEventListener('wheel', handleWheel)
        resizeObserver?.disconnect()
        canvasRenderLocal?.destroy()
        setCanvasRender(null)
      }
    }, [canvasEl, onHoverFocusChange, onRenderModeChange, sceneModelData])

    useEffect(() => {
      canvasRender?.setData(sceneData)
    }, [canvasRender, sceneData])

    useLayoutEffect(() => {
      if (canvasRender) {
        canvasRender.updatePageLayout(layout)
      }
    }, [canvasRender, layout])

    return (
      <div className={s.canvasWrap}>
        <canvas className={s.canvas} ref={setCanvasEl} />
        {canvasRender && (
          <ProgramStateContext.Provider value={canvasRender.progState as never}>
            <div className="scene-panel__event-surface">
              <CanvasEventSurface />
            </div>
          </ProgramStateContext.Provider>
        )}
      </div>
    )
  },
)
