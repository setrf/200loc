import { describe, expect, it, vi } from 'vitest'
import {
  cancelCameraMotion,
  updateCamera,
  type ICamera,
} from '../vendor/llmVizOriginal/llm/Camera'
import { Vec3 } from '../vendor/llmVizOriginal/utils/vector'

function makeCamera(overrides: Partial<ICamera> = {}): ICamera {
  return {
    camPos: new Vec3(),
    camPosModel: new Vec3(),
    lookAtMtx: {} as never,
    viewMtx: {} as never,
    modelMtx: {} as never,
    center: new Vec3(0, 0, 0),
    angle: new Vec3(290, 20, 8),
    transition: {},
    ...overrides,
  }
}

describe('camera transition scheduling', () => {
  it('immediately supersedes an in-flight transition when a new desired camera arrives', () => {
    const state = {
      camera: makeCamera({
        desiredCameraTransition: {
          t: 0.5,
          initialPos: {
            center: new Vec3(0, 0, 0),
            angle: new Vec3(290, 20, 8),
          },
          targetPos: {
            center: new Vec3(100, 0, 0),
            angle: new Vec3(290, 20, 4),
          },
        },
        desiredCamera: {
          center: new Vec3(0, 60, 0),
          angle: new Vec3(287, 18, 6),
        },
      }),
    }
    const view = {
      dt: 16,
      markDirty: vi.fn(),
    }

    updateCamera(state as never, view as never)

    expect(state.camera.desiredCamera).toBeUndefined()
    expect(state.camera.desiredCameraTransition?.targetPos.center.y).toBe(60)
    expect(state.camera.desiredCameraTransition?.targetPos.center.x).toBe(0)
    expect(state.camera.center.x).toBeLessThan(10)
    expect(state.camera.center.y).toBeGreaterThan(0)
    expect(view.markDirty).toHaveBeenCalled()
  })

  it('cancels guided camera motion when manual interaction takes over', () => {
    const camera = makeCamera({
      desiredCamera: {
        center: new Vec3(30, 40, 0),
        angle: new Vec3(287, 18, 6),
      },
      desiredCameraTransition: {
        t: 0.4,
        initialPos: {
          center: new Vec3(0, 0, 0),
          angle: new Vec3(290, 20, 8),
        },
        targetPos: {
          center: new Vec3(100, 0, 0),
          angle: new Vec3(290, 20, 4),
        },
      },
      centerDesired: new Vec3(10, 0, 0),
      angleDesired: new Vec3(290, 20, 7),
      angleZDesired: 7,
      transition: {
        centerT: 0.2,
        angleT: 0.3,
        angleZT: 0.4,
        centerInit: new Vec3(0, 0, 0),
        angleInit: new Vec3(290, 20, 8),
        angleZInit: 8,
      },
    })

    cancelCameraMotion(camera)

    expect(camera.desiredCamera).toBeUndefined()
    expect(camera.desiredCameraTransition).toBeUndefined()
    expect(camera.centerDesired).toBeUndefined()
    expect(camera.angleDesired).toBeUndefined()
    expect(camera.angleZDesired).toBeUndefined()
    expect(camera.transition.centerT).toBeUndefined()
    expect(camera.transition.angleT).toBeUndefined()
    expect(camera.transition.angleZT).toBeUndefined()
  })
})
