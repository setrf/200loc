import { act, fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnnotationPopup } from '../components/AnnotationPopup'
import { ArchitectureScene } from '../components/ArchitectureScene'
import { getFallbackCameraPoseForPhase } from '../components/architectureSceneFallback'
import { CodeViewer } from '../components/CodeViewer'
import { Controls } from '../components/Controls'
import { SegmentTabs } from '../components/SegmentTabs'
import { getCameraPose } from '../viz/llmViz/layout'
import { getGlossaryEntry } from '../walkthrough/glossary'
import type { StoryBeat } from '../walkthrough/phases'
import { inferencePhases } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

const bundle = loadBundle()
const phaseById = (id: (typeof inferencePhases)[number]['id']) =>
  inferencePhases.find((phase) => phase.id === id)!

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
}

function flattenBeat(beat: StoryBeat) {
  return beat.segments.map((segment) => segment.text).join('')
}

function makeControlsProps() {
  const firstPhase = inferencePhases[0]
  return {
    beats: firstPhase.copy.beats,
  }
}

function makePlainBeats(): StoryBeat[] {
  return [
    {
      kind: 'core',
      segments: [{ kind: 'text', text: 'Plain text only.' }],
    },
  ]
}

function makeRect(top: number, height: number, left = 100, width = 120) {
  return {
    x: left,
    y: top,
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

describe('ui components', () => {
  beforeEach(() => {
    setMatchMedia(false)
    Object.defineProperty(window, 'requestAnimationFrame', {
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }),
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      writable: true,
      value: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('highlights active code lines', () => {
    render(
      <CodeViewer
        source={'def first():\n    print("second")\nthird'}
        activeRanges={[{ start: 2, end: 2 }]}
      />,
    )
    expect(screen.getByText('Python')).toBeInTheDocument()
    expect(screen.getByText('print')).toHaveClass('code-viewer__token--builtin')
    expect(screen.getByText('"second"')).toHaveClass('code-viewer__token--string')
    expect(screen.getByText('print').closest('li')).toHaveClass('is-active')
    expect(screen.getByText('first')).toHaveClass('code-viewer__token--definition')
    expect(screen.getByText('first').closest('li')).not.toHaveClass('is-active')
  })

  it('renders blank code lines safely', () => {
    render(<CodeViewer source={'first\n\nthird'} activeRanges={[]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('auto-scrolls the first active code line into view when the range changes', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    const { rerender } = render(
      <CodeViewer
        source={'line one\nline two\nline three\nline four'}
        activeRanges={[{ start: 2, end: 2 }]}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })

    scrollIntoView.mockClear()

    rerender(
      <CodeViewer
        source={'line one\nline two\nline three\nline four'}
        activeRanges={[{ start: 4, end: 4 }]}
      />,
    )

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('does not auto-scroll when the active line is already visible', () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const rect = (top: number, bottom: number, height: number) => ({
      x: 0,
      y: top,
      top,
      bottom,
      left: 0,
      right: 0,
      width: 0,
      height,
      toJSON: () => ({}),
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'OL') {
        return rect(0, 240, 240)
      }
      if (this.tagName === 'LI') {
        return rect(40, 72, 32)
      }
      return rect(0, 0, 0)
    })

    render(
      <CodeViewer
        source={'line one\nline two\nline three\nline four'}
        activeRanges={[{ start: 2, end: 2 }]}
      />,
    )

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('renders the story controls and hover mapping', () => {
    const props = makeControlsProps()
    const { container } = render(<Controls {...props} />)

    expect(screen.getByLabelText('Step explanation')).toBeInTheDocument()
    expect(container.querySelector('.story-panel__summary')?.textContent).toContain(
      flattenBeat(props.beats[0]!),
    )
    expect(container.querySelectorAll('.story-panel__lesson > *')).toHaveLength(1)
    expect(container.querySelectorAll('.story-panel__beat')).toHaveLength(0)
    expect(container.querySelectorAll('.story-panel__beat-label')).toHaveLength(0)
    expect(screen.queryByText('New terms')).not.toBeInTheDocument()
    expect(screen.queryByText(/In the scene:/)).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-glossary-id]').length).toBeGreaterThan(0)
  })

  it('renders a single guided block without term beats when absent', () => {
    const props = makeControlsProps()
    props.beats = props.beats.filter((beat) => beat.kind !== 'term')

    const { container } = render(<Controls {...props} />)

    expect(container.querySelectorAll('.story-panel__beat-label')).toHaveLength(0)
    expect(container.querySelector('.story-panel__summary')?.textContent).toContain(
      flattenBeat(props.beats[0]!),
    )
  })

  it('renders safely when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: undefined,
    })

    render(<Controls {...makeControlsProps()} />)

    expect(screen.getByLabelText('Step explanation')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('shows a desktop annotation popup on hover and keeps it open when pinned', async () => {
    vi.useFakeTimers()
    const props = makeControlsProps()
    render(<Controls {...props} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.mouseEnter(trigger)
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('Context')

    fireEvent.click(trigger)
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseLeave(screen.getByRole('dialog', { hidden: true }))

    await act(async () => {
      vi.advanceTimersByTime(160)
    })

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('clears pending hover timers before the popup opens', async () => {
    vi.useFakeTimers()
    render(<Controls {...makeControlsProps()} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('keeps the hover popup alive when moving from the trigger into the popup', async () => {
    vi.useFakeTimers()
    const props = makeControlsProps()
    render(<Controls {...props} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.mouseEnter(trigger)

    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    const popup = screen.getByRole('dialog', { hidden: true })
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseEnter(popup)

    await act(async () => {
      vi.advanceTimersByTime(160)
    })

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('keeps the popup open for pointer-downs inside the popup and on its trigger', async () => {
    vi.useFakeTimers()
    render(<Controls {...makeControlsProps()} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.click(trigger)

    const popup = screen.getByRole('dialog', { hidden: true })
    fireEvent.mouseDown(popup)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseDown(trigger)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()
  })

  it('allows only one desktop popup at a time', async () => {
    vi.useFakeTimers()
    const beats: StoryBeat[] = [
      {
        kind: 'core',
        segments: [
          { kind: 'term', text: 'Context', glossaryId: 'context' },
          { kind: 'text', text: ' meets ' },
          { kind: 'term', text: 'slot', glossaryId: 'slot' },
          { kind: 'text', text: '.' },
        ],
      },
    ]

    render(
      <Controls
        beats={beats}
      />,
    )

    const contextTrigger = screen.getByRole('button', { name: 'Context' })
    const slotTrigger = screen.getByRole('button', { name: 'slot' })

    fireEvent.mouseEnter(contextTrigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('Context')

    fireEvent.mouseEnter(slotTrigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1)
    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('Slot')
  })

  it('ignores stale hover opens after the trigger unmounts', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Controls {...makeControlsProps()} />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Context' }))
    rerender(<Controls beats={makePlainBeats()} />)

    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('re-syncs an open popup for the same trigger and preserves pinned state', async () => {
    vi.useFakeTimers()
    render(<Controls {...makeControlsProps()} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.mouseEnter(trigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseEnter(trigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.mouseEnter(trigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()
  })

  it('renders an inline popin instead of a floating popup on compact viewports', () => {
    setMatchMedia(true)
    const props = makeControlsProps()
    const { container } = render(<Controls {...props} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.click(trigger)

    expect(container.querySelector('.annotation-popup--inline')).toBeInTheDocument()
    expect(document.querySelector('.annotation-popup--floating')).not.toBeInTheDocument()

    fireEvent.click(trigger)
    expect(container.querySelector('.annotation-popup--inline')).not.toBeInTheDocument()
  })

  it('ignores hover open and close on compact viewports', async () => {
    vi.useFakeTimers()
    setMatchMedia(true)
    render(<Controls {...makeControlsProps()} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('closes a pinned desktop annotation when the same trigger is clicked again', async () => {
    vi.useFakeTimers()
    render(<Controls {...makeControlsProps()} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('updates popup anchors on resize and drops stale listeners safely after close', () => {
    const listeners = new Map<string, EventListener>()
    const addEventListenerSpy = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          listeners.set(type, listener)
        }
      }) as typeof window.addEventListener)
    const removeEventListenerSpy = vi
      .spyOn(window, 'removeEventListener')
      .mockImplementation(((type: string) => {
        listeners.delete(type)
      }) as typeof window.removeEventListener)

    render(<Controls {...makeControlsProps()} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.click(trigger)

    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeTypeOf('function')

    resizeListener!(new Event('resize'))
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    act(() => {
      fireEvent.mouseDown(document.body)
    })
    act(() => {
      resizeListener!(new Event('resize'))
    })
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()

    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('closes an open popup when its trigger disappears before repositioning', () => {
    const listeners = new Map<string, EventListener>()
    vi.spyOn(window, 'addEventListener').mockImplementation(
      ((type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          listeners.set(type, listener)
        }
      }) as typeof window.addEventListener,
    )

    const { rerender } = render(<Controls {...makeControlsProps()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Context' }))
    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeTypeOf('function')

    act(() => {
      rerender(<Controls beats={makePlainBeats()} />)
    })
    act(() => {
      resizeListener!(new Event('resize'))
    })

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('switches mobile tabs through the callback', () => {
    const onChange = vi.fn()
    render(<SegmentTabs activeTab="story" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
    expect(onChange).toHaveBeenCalledWith('scene')
  })

  it('supports keyboard navigation on the mobile section buttons', () => {
    const onChange = vi.fn()
    render(<SegmentTabs activeTab="story" onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Story' }), {
      key: 'ArrowRight',
    })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Story' }), {
      key: 'Home',
    })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Story' }), {
      key: 'End',
    })

    expect(onChange).toHaveBeenNthCalledWith(1, 'scene')
    expect(onChange).toHaveBeenNthCalledWith(2, 'code')
    expect(onChange).toHaveBeenNthCalledWith(3, 'scene')
  })

  it('supports reverse keyboard navigation on the mobile section buttons', () => {
    const onChange = vi.fn()
    render(<SegmentTabs activeTab="story" onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Story' }), {
      key: 'ArrowLeft',
    })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Story' }), {
      key: 'ArrowUp',
    })

    expect(onChange).toHaveBeenNthCalledWith(1, 'code')
    expect(onChange).toHaveBeenNthCalledWith(2, 'code')
  })

  it('positions floating annotation popups above or clamped inside the viewport', () => {
    const entry = getGlossaryEntry('context')
    const boundingRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')

    boundingRectSpy.mockReturnValueOnce(makeRect(0, 80, 0, 220))
    const upperRef = createRef<HTMLDivElement>()
    const { unmount } = render(
      <AnnotationPopup
        ref={upperRef}
        anchorRect={makeRect(700, 24)}
        entry={entry}
        mode="floating"
      />,
    )

    const upperDialog = screen.getByRole('dialog', { hidden: true })
    expect(upperDialog).toHaveStyle({ top: '606px', left: '50px' })
    unmount()

    boundingRectSpy.mockReturnValueOnce(makeRect(0, 700, 0, 220))
    const clampedRef = createRef<HTMLDivElement>()
    render(
      <AnnotationPopup
        ref={clampedRef}
        anchorRect={makeRect(700, 24)}
        entry={entry}
        mode="floating"
      />,
    )

    const dialogs = screen.getAllByRole('dialog', { hidden: true })
    const clampedDialog = dialogs[dialogs.length - 1]!
    expect(clampedDialog).toHaveStyle({ top: '56px', left: '50px' })
  })

  it('reuses existing floating popup coordinates when the position does not change', () => {
    const entry = getGlossaryEntry('context')
    const boundingRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    boundingRectSpy.mockReturnValue(makeRect(0, 80, 0, 220))

    const sharedRef = createRef<HTMLDivElement>()
    const { rerender } = render(
      <AnnotationPopup
        ref={sharedRef}
        anchorRect={makeRect(240, 24)}
        entry={entry}
        mode="floating"
      />,
    )

    const dialog = screen.getByRole('dialog', { hidden: true })
    const initialTop = dialog.style.top
    const initialLeft = dialog.style.left

    rerender(
      <AnnotationPopup
        ref={sharedRef}
        anchorRect={makeRect(240, 24)}
        entry={entry}
        mode="floating"
      />,
    )

    expect(screen.getByRole('dialog', { hidden: true })).toHaveStyle({
      top: initialTop,
      left: initialLeft,
    })
  })

  it('renders floating annotation popups safely when a callback ref is used', () => {
    render(
      <AnnotationPopup
        ref={() => {}}
        anchorRect={makeRect(120, 24)}
        entry={getGlossaryEntry('context')}
        mode="floating"
      />,
    )

    expect(screen.getByRole('dialog', { hidden: true })).toHaveStyle({ visibility: 'hidden' })
  })

  it('renders the microgpt scene fallback and exposes code-focus affordances', async () => {
    const onFocusRanges = vi.fn()
    render(
      <ArchitectureScene
        trace={makeTrace()}
        phase={phaseById('tokenize')}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={onFocusRanges}
      />,
    )

    expect(await screen.findByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.getByText('drag to pan · wheel to zoom · double click to reset')).toBeInTheDocument()
    expect(screen.queryByText('Original llm-viz')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vendored-layer-view')).not.toBeInTheDocument()
    expect(screen.queryByText('Readable history for this moment')).not.toBeInTheDocument()

    const scene = screen.getByLabelText('Architecture scene')
    fireEvent.mouseEnter(scene)
    expect(onFocusRanges).toHaveBeenCalledWith(phaseById('tokenize').codeRanges)
    fireEvent.mouseLeave(scene)
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)

    fireEvent.mouseEnter(document.querySelector('.scene-panel__fallback-edge')!)
    expect(onFocusRanges).toHaveBeenLastCalledWith(phaseById('tokenize').codeRanges)
    fireEvent.mouseLeave(document.querySelector('.scene-panel__fallback-edge')!)
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)

    fireEvent.mouseEnter(document.querySelector('.scene-panel__fallback-node')!)
    expect(onFocusRanges).toHaveBeenLastCalledWith(phaseById('tokenize').codeRanges)
    fireEvent.mouseLeave(document.querySelector('.scene-panel__fallback-node')!)
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)
  })

  it('keeps the scene shell stable as phases change', async () => {
    const { rerender } = render(
      <ArchitectureScene
        trace={makeTrace()}
        phase={phaseById('attention-scores')}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(await screen.findByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.queryByText('attention scores')).not.toBeInTheDocument()

    rerender(
      <ArchitectureScene
        trace={makeTrace()}
        phase={phaseById('attention-softmax')}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.queryByText('attention weights')).not.toBeInTheDocument()

    rerender(
      <ArchitectureScene
        trace={makeTrace()}
        phase={phaseById('qkv')}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('fallback-scene')).toBeInTheDocument()

    rerender(
      <ArchitectureScene
        trace={makeTrace({ sampledTokenId: 7 })}
        phase={phaseById('append-or-stop')}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.queryByText('append or stop')).not.toBeInTheDocument()
  })

  it('uses phase-specific fallback framing for the lower readout phases', () => {
    const lmHeadPose = getFallbackCameraPoseForPhase(phaseById('lm-head'))
    const probabilitiesPose = getFallbackCameraPoseForPhase(phaseById('probabilities'))
    const samplePose = getFallbackCameraPoseForPhase(phaseById('sample'))
    const defaultPose = getFallbackCameraPoseForPhase({
      ...inferencePhases[0]!,
      id: 'unknown-phase',
    } as typeof inferencePhases[number])

    expect(lmHeadPose.panY).toBeLessThan(-880)
    expect(probabilitiesPose.panY).toBeLessThan(lmHeadPose.panY)
    expect(samplePose.panY).toBeLessThan(probabilitiesPose.panY)
    expect(samplePose.scale).toBeGreaterThan(probabilitiesPose.scale)
    expect(defaultPose).toEqual(getCameraPose(inferencePhases[0]!.viz.cameraPoseId))
  })
})
