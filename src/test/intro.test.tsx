import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IntroWalkthrough } from '../components/IntroWalkthrough'
import { introSteps } from '../intro/steps'
import {
  INTRO_SEEN_STORAGE_KEY,
  readHasSeenIntro,
  writeHasSeenIntro,
} from '../intro/storage'

describe('intro walkthrough', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
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
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked')
      })

    expect(readHasSeenIntro()).toBe(false)
    expect(() => writeHasSeenIntro(true)).not.toThrow()

    getItemSpy.mockRestore()
    setItemSpy.mockRestore()
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
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
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

    fireEvent.click(screen.getByRole('button', { name: 'token' }))

    expect(screen.getByRole('dialog')).toHaveTextContent('Token')
    expect(
      screen.getByText(
        'One small text piece the model can read or write in a single step.',
      ),
    ).toBeInTheDocument()
  })
})
