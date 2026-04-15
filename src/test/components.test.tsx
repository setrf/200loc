import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArchitectureScene } from '../components/ArchitectureScene'
import { getFallbackCameraPoseForPhase } from '../components/architectureSceneFallback'
import { CodeViewer } from '../components/CodeViewer'
import { Controls } from '../components/Controls'
import { SegmentTabs } from '../components/SegmentTabs'
import { getCameraPose } from '../viz/llmViz/layout'
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

describe('ui components', () => {
  beforeEach(() => {
    setMatchMedia(false)
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

  it('shows a desktop annotation popup on hover and keeps it open when pinned', async () => {
    vi.useFakeTimers()
    const props = makeControlsProps()
    render(<Controls {...props} />)

    const trigger = screen.getByRole('button', { name: 'Context' })
    fireEvent.mouseEnter(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    expect(screen.getByRole('dialog')).toHaveTextContent('Context')

    fireEvent.click(trigger)
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseLeave(screen.getByRole('dialog'))

    await act(async () => {
      vi.advanceTimersByTime(160)
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

    const popup = screen.getByRole('dialog')
    fireEvent.mouseLeave(trigger)
    fireEvent.mouseEnter(popup)

    await act(async () => {
      vi.advanceTimersByTime(160)
    })

    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
    expect(screen.getByRole('dialog')).toHaveTextContent('Context')

    fireEvent.mouseEnter(slotTrigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog')).toHaveTextContent('Slot')
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
