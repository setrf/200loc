import { describe, expect, it, vi } from 'vitest'
import { updateCamera, type ICamera } from '../vendor/llmVizOriginal/llm/Camera'
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
})
