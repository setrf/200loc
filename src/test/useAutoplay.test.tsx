import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoplay } from '../hooks/useAutoplay'

function Harness({
  active,
  step,
  delayMs,
}: {
  active: boolean
  step: () => void
  delayMs: number
}) {
  useAutoplay(active, step, delayMs)
  return null
}

describe('useAutoplay', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing while inactive', () => {
    const step = vi.fn()
    render(<Harness active={false} step={step} delayMs={200} />)
    vi.advanceTimersByTime(1000)
    expect(step).not.toHaveBeenCalled()
  })

  it('ticks while active and cleans up on rerender', () => {
    const step = vi.fn()
    const { rerender, unmount } = render(
      <Harness active={true} step={step} delayMs={200} />,
    )

    vi.advanceTimersByTime(450)
    expect(step).toHaveBeenCalledTimes(2)

    rerender(<Harness active={false} step={step} delayMs={200} />)
    vi.advanceTimersByTime(450)
    expect(step).toHaveBeenCalledTimes(2)

    unmount()
  })

  it('does not recreate the interval when only the step callback changes', () => {
    const step = vi.fn()
    const nextStep = vi.fn()
    const setIntervalSpy = vi.spyOn(window, 'setInterval')
    const { rerender } = render(<Harness active={true} step={step} delayMs={200} />)

    vi.advanceTimersByTime(200)
    expect(step).toHaveBeenCalledTimes(1)
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)

    rerender(<Harness active={true} step={nextStep} delayMs={200} />)
    vi.advanceTimersByTime(200)

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    expect(nextStep).toHaveBeenCalledTimes(1)
  })
})
