import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MicroLayerView } from '../viz/microViz/LayerView'
import { buildVizFrame } from '../viz/llmViz/frame'
import * as programModule from '../viz/microViz/program'
import { siteMicroVizTheme } from '../viz/microViz/theme'
import { loadBundle, makeTrace } from './helpers/fixtures'
import { inferencePhases } from '../walkthrough/phases'
import { Vec3 } from '../vendor/llmVizOriginal/utils/vector'

vi.mock('../vendor/llmVizOriginal/llm/CanvasEventSurface', () => ({
  CanvasEventSurface: () => <div data-testid="mock-event-surface" />,
}))

vi.mock('../viz/microViz/program', () => ({
  loadMicroVizFontAtlas: vi.fn(async () => ({})),
  initMicroVizProgramState: vi.fn((canvasEl: HTMLCanvasElement) => ({
    render: {
      canvasEl,
      gl: {},
      size: new Vec3(1, 1),
      syncObjects: [],
    },
    camera: {},
    mouse: {
      mousePos: new Vec3(),
    },
    display: {
      hoverTarget: null,
    },
    movement: {
      action: null,
    },
    walkthrough: {
      dimHighlightBlocks: null,
    },
    htmlSubs: {
      notify() {},
    },
    layout: {
      cubeFocusIds: {},
    },
    shape: {},
    pageLayout: {
      height: 0,
      width: 0,
      isDesktop: true,
      isPhone: false,
    },
    markDirty() {},
    microViz: {
      phaseState: null,
    },
  })),
  runMicroVizProgram: vi.fn(),
  setMicroVizProgramData: vi.fn(),
}))

const bundle = loadBundle()
const originalGetContext = HTMLCanvasElement.prototype.getContext
const originalRequestAnimationFrame = globalThis.requestAnimationFrame
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

describe('MicroLayerView first frame readiness', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(kind: string) {
        if (kind === 'webgl2') {
          return {}
        }
        return (originalGetContext as (...args: unknown[]) => unknown).call(this, kind)
      },
    })

    vi.stubGlobal(
      'requestAnimationFrame',
      ((callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0)) as typeof requestAnimationFrame,
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      ((handle: number) => window.clearTimeout(handle)) as typeof cancelAnimationFrame,
    )
  })

  afterEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: originalGetContext,
    })
    vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', originalCancelAnimationFrame)
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('waits for the first rendered frame before switching to webgl mode', async () => {
    const onHoverFocusChange = vi.fn()
    const onRenderModeChange = vi.fn()
    const onRenderIssueChange = vi.fn()

    render(
      <MicroLayerView
        phase={inferencePhases[0]!}
        trace={makeTrace()}
        contextTokens={['BOS']}
        vizFrame={buildVizFrame(
          makeTrace(),
          inferencePhases[0]!,
          bundle,
          ['BOS'],
          (tokenId) => (tokenId === bundle.config.bosToken ? 'BOS' : bundle.vocab[tokenId] ?? '?'),
        )}
        sceneModelData={bundle}
        theme={siteMicroVizTheme}
        onHoverFocusChange={onHoverFocusChange}
        onRenderModeChange={onRenderModeChange}
        onRenderIssueChange={onRenderIssueChange}
      />,
    )

    await Promise.resolve()
    expect(onRenderModeChange).not.toHaveBeenCalledWith('webgl')

    await waitFor(() => {
      expect(onRenderModeChange).toHaveBeenCalledWith('webgl')
    })
  })

  it('falls back when font atlas bootstrap never resolves', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(programModule.loadMicroVizFontAtlas).mockReturnValueOnce(
      new Promise(() => {}) as never,
    )

    const onHoverFocusChange = vi.fn()
    const onRenderModeChange = vi.fn()
    const onRenderIssueChange = vi.fn()

    render(
      <MicroLayerView
        phase={inferencePhases[0]!}
        trace={makeTrace()}
        contextTokens={['BOS']}
        vizFrame={buildVizFrame(
          makeTrace(),
          inferencePhases[0]!,
          bundle,
          ['BOS'],
          (tokenId) => (tokenId === bundle.config.bosToken ? 'BOS' : bundle.vocab[tokenId] ?? '?'),
        )}
        sceneModelData={bundle}
        theme={siteMicroVizTheme}
        onHoverFocusChange={onHoverFocusChange}
        onRenderModeChange={onRenderModeChange}
        onRenderIssueChange={onRenderIssueChange}
      />,
    )

    await vi.advanceTimersByTimeAsync(4100)
    expect(onRenderModeChange).toHaveBeenCalledWith('fallback')
    expect(onRenderIssueChange).toHaveBeenCalledWith(
      'Model viewer timed out while loading its font atlas.',
    )
  })
})
