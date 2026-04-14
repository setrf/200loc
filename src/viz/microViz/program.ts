import type { TokenStepTrace } from '../../model'
import type { PhaseDefinition } from '../../walkthrough/phases'
import type { VizFrame } from '../llmViz/types'
import type { ICamera } from '../../vendor/llmVizOriginal/llm/Camera'
import {
  genModelViewMatrices,
  updateCamera,
} from '../../vendor/llmVizOriginal/llm/Camera'
import { drawBlockInfo } from '../../vendor/llmVizOriginal/llm/components/BlockInfo'
import { runMouseHitTesting } from '../../vendor/llmVizOriginal/llm/Interaction'
import type { IRenderView } from '../../vendor/llmVizOriginal/llm/render/modelRender'
import {
  fetchFontAtlasData,
  type IFontAtlasData,
} from '../../vendor/llmVizOriginal/llm/render/fontRender'
import {
  initRender,
  renderModel,
  resetRenderBuffers,
} from '../../vendor/llmVizOriginal/llm/render/modelRender'
import { Mat4f } from '../../vendor/llmVizOriginal/utils/matrix'
import { Subscriptions } from '../../vendor/llmVizOriginal/utils/hooks'
import { Vec3 } from '../../vendor/llmVizOriginal/utils/vector'
import type { IMovementInfo } from '../../vendor/llmVizOriginal/llm/components/MovementControls'
import { MovementAction } from '../../vendor/llmVizOriginal/llm/components/MovementControls'
import { createMicroVizTextures, drawMicroVizEdges } from './bridge'
import { applyMicroVizPhase, buildMicroVizPhaseState, uploadMicroVizFrame } from './bridge'
import { buildMicroVizLayout } from './layout'
import type {
  MicroVizPhaseState,
  MicroVizRenderContext,
  MicroVizStaticModel,
} from './types'

export interface MicroVizProgramData {
  phase: PhaseDefinition
  trace: TokenStepTrace
  contextTokens: string[]
  vizFrame: VizFrame
}

export interface MicroVizProgramState {
  render: MicroVizRenderContext['renderState']
  camera: ICamera
  mouse: {
    mousePos: Vec3
  }
  display: {
    tokenColors: null
    tokenIdxColors: null
    tokenOutputColors: null
    lines: string[]
    hoverTarget: unknown
    blkIdxHover: number[] | null
    dimHover: unknown
    topOutputOpacity?: number
  }
  movement: IMovementInfo
  walkthrough: {
    dimHighlightBlocks: null
  }
  htmlSubs: Subscriptions
  layout: MicroVizRenderContext['layout']
  shape: MicroVizRenderContext['layout']['shape']
  pageLayout: {
    height: number
    width: number
    isDesktop: boolean
    isPhone: boolean
  }
  markDirty: () => void
  microViz: {
    sceneModelData: MicroVizStaticModel
    renderContext: MicroVizRenderContext
    phaseState: MicroVizPhaseState | null
    data: MicroVizProgramData | null
  }
}

export function createCamera(initialCenter: Vec3, initialAngle: Vec3): ICamera {
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

export async function loadMicroVizFontAtlas(): Promise<IFontAtlasData> {
  return fetchFontAtlasData()
}

export function initMicroVizProgramState(
  canvasEl: HTMLCanvasElement,
  fontAtlasData: IFontAtlasData,
  sceneModelData: MicroVizStaticModel,
): MicroVizProgramState {
  const render = initRender(canvasEl, fontAtlasData)
  if (!render) {
    throw new Error('WebGL2 unavailable')
  }

  const layout = buildMicroVizLayout(sceneModelData)
  const textures = createMicroVizTextures(render.gl, sceneModelData)
  const overview = layout.cameraPoses.overview
  const camera = createCamera(overview.center, overview.angle)
  const renderContext: MicroVizRenderContext = {
    renderState: render,
    layout,
    textures,
    camera,
  }

  return {
    render,
    camera,
    mouse: {
      mousePos: new Vec3(),
    },
    display: {
      tokenColors: null,
      tokenIdxColors: null,
      tokenOutputColors: null,
      lines: [],
      hoverTarget: null,
      blkIdxHover: null,
      dimHover: null,
    },
    movement: {
      action: null,
      actionHover: null,
      target: [0, 0],
      depth: 1,
      cameraLerp: null,
    },
    walkthrough: {
      dimHighlightBlocks: null,
    },
    htmlSubs: new Subscriptions(),
    layout,
    shape: layout.shape,
    pageLayout: {
      height: 0,
      width: 0,
      isDesktop: true,
      isPhone: false,
    },
    markDirty: () => {},
    microViz: {
      sceneModelData,
      renderContext,
      phaseState: null,
      data: null,
    },
  }
}

export function setMicroVizProgramData(
  state: MicroVizProgramState,
  data: MicroVizProgramData,
) {
  state.microViz.data = data
  const phaseState = buildMicroVizPhaseState(
    data.phase,
    data.vizFrame,
    state.microViz.renderContext.layout,
  )
  state.microViz.phaseState = phaseState
  uploadMicroVizFrame(
    state.microViz.renderContext,
    state.microViz.sceneModelData,
    phaseState,
    data.trace,
    data.contextTokens.length,
  )
  applyMicroVizPhase(state.microViz.renderContext, phaseState)
}

function manageMicroVizMovement(
  state: MicroVizProgramState,
  phaseState: MicroVizPhaseState,
) {
  const action = state.movement.action
  if (action === null) {
    return
  }

  state.movement.action = null

  const camera = state.camera
  const zoom = Math.max(camera.angle.z, 0.1)
  const panStep = Math.max(6, zoom * 0.08)
  const verticalStep = Math.max(10, zoom * 0.12)
  const nextCenter = camera.center.clone()
  const nextAngle = camera.angle.clone()

  if (action === MovementAction.Left) {
    nextCenter.x -= panStep
  }
  if (action === MovementAction.Right) {
    nextCenter.x += panStep
  }
  if (action === MovementAction.Up) {
    nextCenter.z -= verticalStep
  }
  if (action === MovementAction.Down) {
    nextCenter.z += verticalStep
  }
  if (action === MovementAction.In) {
    nextAngle.z = Math.max(0.1, nextAngle.z * 0.88)
  }
  if (action === MovementAction.Out) {
    nextAngle.z = Math.min(100000, nextAngle.z * 1.12)
  }

  const targetPose =
    action === MovementAction.Expand
      ? state.layout.cameraPoses.overview
      : action === MovementAction.Focus
        ? state.layout.cameraPoses[phaseState.cameraPoseId]
        : null

  if (targetPose) {
    state.camera.center = targetPose.center.clone()
    state.camera.angle = targetPose.angle.clone()
  } else {
    state.camera.center = nextCenter
    state.camera.angle = nextAngle
  }

  state.markDirty()
}

export function runMicroVizProgram(
  view: IRenderView,
  state: MicroVizProgramState,
) {
  const { renderContext, phaseState } = state.microViz
  if (!phaseState) {
    return
  }

  resetRenderBuffers(state.render)
  state.display.lines = []
  state.display.hoverTarget = null
  state.display.blkIdxHover = null
  state.display.dimHover = null

  manageMicroVizMovement(state, phaseState)
  updateCamera(state as never, view)
  genModelViewMatrices(state as never, state.layout as never)

  drawMicroVizEdges(renderContext, phaseState)
  drawBlockInfo(state as never)
  runMouseHitTesting(state as never)

  renderModel({
    render: state.render,
    layout: state.layout as never,
    camera: state.camera,
    examples: [],
  } as never)
}
