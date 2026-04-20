import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntroWalkthrough } from '../components/IntroWalkthrough'
import type { IntroStepDefinition } from '../intro/steps'
import { introSteps } from '../intro/steps'
import {
  INTRO_SEEN_STORAGE_KEY,
  readHasSeenIntro,
  writeHasSeenIntro,
} from '../intro/storage'

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

describe('intro walkthrough', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    window.localStorage.clear?.()
  })

  it('renders the current intro step with simple progress and actions', () => {
    render(
      <IntroWalkthrough
        activeStepIndex={2}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    expect(
      screen.getByText('Each token is turned into numbers.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('uses the final call to action on the last step', () => {
    render(
      <IntroWalkthrough
        activeStepIndex={introSteps.length - 1}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Open live walkthrough' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1)
  })

  it('persists the intro completion flag safely', () => {
    expect(readHasSeenIntro()).toBe(false)

    writeHasSeenIntro(true)
    expect(window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY)).toBe('true')
    expect(readHasSeenIntro()).toBe(true)

    writeHasSeenIntro(false)
    expect(window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY)).toBeNull()
    expect(readHasSeenIntro()).toBe(false)
  })

  it('ignores storage errors instead of crashing', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      writable: true,
      value: {
        getItem() {
          throw new Error('blocked')
        },
        setItem() {
          throw new Error('blocked')
        },
        removeItem() {
          throw new Error('blocked')
        },
      },
    })

    expect(readHasSeenIntro()).toBe(false)
    expect(() => writeHasSeenIntro(true)).not.toThrow()
    expect(() => writeHasSeenIntro(false)).not.toThrow()
  })

  it('returns safe defaults when window storage is unavailable entirely', () => {
    vi.stubGlobal('window', undefined)

    expect(readHasSeenIntro()).toBe(false)
    expect(() => writeHasSeenIntro(true)).not.toThrow()
    expect(() => writeHasSeenIntro(false)).not.toThrow()
  })

  it('wires the intro actions', () => {
    const onBack = vi.fn()
    const onNext = vi.fn()
    const onSkip = vi.fn()

    render(
      <IntroWalkthrough
        activeStepIndex={1}
        steps={introSteps}
        onBack={onBack}
        onNext={onNext}
        onSkip={onSkip}
        onOpenLab={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('reuses the glossary popup system for selected intro terms', () => {
    setMatchMedia(true)

    render(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'token' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Token')
    expect(
      screen.getByText(
        'One small text piece the model can read or write in a single step.',
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'token' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ignores hover open and close on compact viewports', async () => {
    vi.useFakeTimers()
    setMatchMedia(true)

    render(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'token' })
    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)

    await act(async () => {
      vi.advanceTimersByTime(400)
    })

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('supports desktop hover, pinning, and closing glossary popups', async () => {
    vi.useFakeTimers()
    setMatchMedia(false)

    render(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    const trigger = screen.getByRole('button', { name: 'token' })
    fireEvent.mouseOver(trigger)

    await act(async () => {
      vi.advanceTimersByTime(280)
    })

    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('Token')

    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.mouseOut(trigger)
    await act(async () => {
      vi.advanceTimersByTime(160)
    })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseOut(trigger)
    fireEvent.mouseOver(screen.getByRole('dialog', { hidden: true }))
    await act(async () => {
      vi.advanceTimersByTime(160)
    })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByRole('dialog', { hidden: true }))
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseDown(trigger)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('updates popup positioning on resize and closes safely when the trigger disappears', async () => {
    vi.useFakeTimers()
    setMatchMedia(false)

    const listeners = new Map<string, EventListener>()
    vi.spyOn(window, 'addEventListener').mockImplementation(
      ((type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') {
          listeners.set(type, listener)
        }
      }) as typeof window.addEventListener,
    )
    vi.spyOn(window, 'removeEventListener').mockImplementation(
      ((type: string) => {
        listeners.delete(type)
      }) as typeof window.removeEventListener,
    )

    const { rerender } = render(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    const trigger = screen.getByRole('button', { name: 'token' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    const resizeListener = listeners.get('resize')
    expect(resizeListener).toBeTypeOf('function')

    act(() => {
      resizeListener!(new Event('resize'))
    })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()

    act(() => {
      resizeListener!(new Event('resize'))
    })
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()

    rerender(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={[
          {
            ...introSteps[0]!,
            lines: [{ segments: [{ kind: 'text', text: 'Plain text only.' }] }],
          },
        ]}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    act(() => {
      resizeListener!(new Event('resize'))
    })

    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('re-syncs hover popups, ignores stale unmounted triggers, and no-ops hover on compact viewports', async () => {
    vi.useFakeTimers()
    setMatchMedia(false)

    const stepsWithTerm = [
      {
        ...introSteps[0]!,
        lines: [{ segments: [{ kind: 'term', text: 'token', glossaryId: 'token' }] }],
      },
    ] satisfies IntroStepDefinition[]
    const { rerender } = render(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={stepsWithTerm}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    await act(async () => {
      vi.advanceTimersByTime(0)
    })

    const trigger = screen.getByRole('button', { name: 'token' })
    fireEvent.mouseOver(trigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.mouseOver(trigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.click(trigger)
    fireEvent.mouseOver(trigger)
    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()

    fireEvent.mouseOver(trigger)
    rerender(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={[
          {
            ...stepsWithTerm[0]!,
            lines: [{ segments: [{ kind: 'text', text: 'No glossary here.' }] }],
          },
        ] satisfies IntroStepDefinition[]}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )
    await act(async () => {
      vi.advanceTimersByTime(280)
    })
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()

    setMatchMedia(true)
    rerender(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'token' }))
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'token' }))
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })

  it('renders safely when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    render(
      <IntroWalkthrough
        activeStepIndex={0}
        steps={introSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onSkip={vi.fn()}
        onOpenLab={vi.fn()}
      />,
    )

    expect(screen.getByText('How LLM systems actually work')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
  })
})
