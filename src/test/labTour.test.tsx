import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  desktopLabTourSteps,
  mobileLabTourSteps,
} from '../labTour/steps'
import {
  LAB_TOUR_SEEN_STORAGE_KEY,
  readHasSeenLabTour,
  writeHasSeenLabTour,
} from '../labTour/storage'
import { LabTourOverlay } from '../components/LabTourOverlay'

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  })
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

describe('lab tour helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    window.localStorage.clear?.()
  })

  it('persists the lab tour completion flag safely', () => {
    expect(readHasSeenLabTour()).toBe(false)

    writeHasSeenLabTour(true)
    expect(window.localStorage.getItem(LAB_TOUR_SEEN_STORAGE_KEY)).toBe('true')
    expect(readHasSeenLabTour()).toBe(true)

    writeHasSeenLabTour(false)
    expect(window.localStorage.getItem(LAB_TOUR_SEEN_STORAGE_KEY)).toBeNull()
    expect(readHasSeenLabTour()).toBe(false)
  })

  it('ignores storage errors and missing window access', () => {
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

    expect(readHasSeenLabTour()).toBe(false)
    expect(() => writeHasSeenLabTour(true)).not.toThrow()
    expect(() => writeHasSeenLabTour(false)).not.toThrow()

    vi.stubGlobal('window', undefined)
    expect(readHasSeenLabTour()).toBe(false)
    expect(() => writeHasSeenLabTour(true)).not.toThrow()
  })

  it('centers the overlay card when the target element is missing', async () => {
    setViewport(800, 600)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('lab-tour__card')) {
        return makeRect(0, 160, 0, 280)
      }
      return makeRect(0, 0, 0, 0)
    })

    render(
      <LabTourOverlay
        activeStepIndex={0}
        layoutVersion="story"
        steps={desktopLabTourSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onFinish={vi.fn()}
      />,
    )

    const card = document.querySelector('.lab-tour__card') as HTMLElement
    await waitFor(() => {
      expect(card.style.top).toBe('220px')
      expect(card.style.left).toBe('260px')
    })
    expect(document.querySelector('.lab-tour__spotlight')).not.toBeInTheDocument()
  })

  it('positions the overlay above the target when space below is too tight', async () => {
    setViewport(900, 700)

    const target = document.createElement('div')
    target.dataset.labTour = 'controls'
    document.body.appendChild(target)

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('lab-tour__card')) {
        return makeRect(0, 150, 0, 240)
      }
      if (this.dataset.labTour === 'controls') {
        return makeRect(520, 120, 180, 160)
      }
      return makeRect(0, 0, 0, 0)
    })

    render(
      <LabTourOverlay
        activeStepIndex={1}
        layoutVersion="story"
        steps={mobileLabTourSteps}
        onBack={vi.fn()}
        onNext={vi.fn()}
        onFinish={vi.fn()}
      />,
    )

    const card = document.querySelector('.lab-tour__card') as HTMLElement
    await waitFor(() => {
      expect(card.style.top).toBe('354px')
      expect(card.style.left).toBe('140px')
    })
    expect(document.querySelector('.lab-tour__spotlight')).toBeInTheDocument()
  })

  it('updates the active step callbacks', () => {
    const onBack = vi.fn()
    const onNext = vi.fn()
    const onFinish = vi.fn()

    render(
      <LabTourOverlay
        activeStepIndex={desktopLabTourSteps.length - 1}
        layoutVersion="story"
        steps={desktopLabTourSteps}
        onBack={onBack}
        onNext={onNext}
        onFinish={onFinish}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start exploring' }))

    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onFinish).toHaveBeenCalledTimes(1)
    expect(onNext).not.toHaveBeenCalled()
  })
})
