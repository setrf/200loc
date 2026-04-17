import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { LabTourStepDefinition } from '../labTour/steps'

interface LabTourOverlayProps {
  activeStepIndex: number
  layoutVersion: string
  steps: LabTourStepDefinition[]
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  onFinish: () => void
}

interface RectState {
  top: number
  left: number
  width: number
  height: number
}

const VIEWPORT_GUTTER = 18

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toRectState(rect: DOMRect): RectState {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  }
}

export function LabTourOverlay({
  activeStepIndex,
  layoutVersion,
  steps,
  onBack,
  onNext,
  onSkip,
  onFinish,
}: LabTourOverlayProps) {
  const step = steps[activeStepIndex]!
  const isFirst = activeStepIndex === 0
  const isLast = activeStepIndex === steps.length - 1
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [targetRect, setTargetRect] = useState<RectState | null>(null)
  const [cardStyle, setCardStyle] = useState<{ top: number; left: number } | null>(
    null,
  )

  useEffect(() => {
    const updatePosition = () => {
      const element = document.querySelector<HTMLElement>(
        `[data-lab-tour="${step.targetId}"]`,
      )

      if (!element) {
        setTargetRect(null)
        return
      }

      const rect = element.getBoundingClientRect()
      setTargetRect(toRectState(rect))
    }

    updatePosition()

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [layoutVersion, step.targetId])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) {
      return
    }

    const cardRect = card.getBoundingClientRect()

    if (!targetRect) {
      setCardStyle({
        top: Math.max(
          VIEWPORT_GUTTER,
          Math.round(window.innerHeight / 2 - cardRect.height / 2),
        ),
        left: Math.max(
          VIEWPORT_GUTTER,
          Math.round(window.innerWidth / 2 - cardRect.width / 2),
        ),
      })
      return
    }

    const maxLeft = Math.max(
      VIEWPORT_GUTTER,
      window.innerWidth - cardRect.width - VIEWPORT_GUTTER,
    )
    const preferredLeft =
      targetRect.left + targetRect.width / 2 - cardRect.width / 2
    const left = clamp(preferredLeft, VIEWPORT_GUTTER, maxLeft)

    const spaceBelow = window.innerHeight - targetRect.top - targetRect.height
    const spaceAbove = targetRect.top

    let top = targetRect.top + targetRect.height + 18
    if (spaceBelow < cardRect.height + 28 && spaceAbove > cardRect.height + 28) {
      top = targetRect.top - cardRect.height - 18
    }

    const maxTop = Math.max(
      VIEWPORT_GUTTER,
      window.innerHeight - cardRect.height - VIEWPORT_GUTTER,
    )
    setCardStyle({
      top: clamp(top, VIEWPORT_GUTTER, maxTop),
      left,
    })
  }, [step.id, targetRect])

  return (
    <div className="lab-tour" role="dialog" aria-modal="true" aria-label="Lab tour">
      <div className="lab-tour__backdrop" />
      {targetRect ? (
        <div
          className="lab-tour__spotlight"
          style={{
            top: targetRect.top - 8,
            left: targetRect.left - 8,
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        className="lab-tour__card"
        style={
          cardStyle
            ? {
                top: cardStyle.top,
                left: cardStyle.left,
              }
            : undefined
        }
      >
        <p className="lab-tour__step">
          Guide {activeStepIndex + 1} of {steps.length}
        </p>
        <h3>{step.title}</h3>
        <p>{step.description}</p>

        <div className="lab-tour__actions">
          <button
            type="button"
            className="intro-button intro-button--secondary"
            onClick={onBack}
            disabled={isFirst}
          >
            Back
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--quiet"
            onClick={onSkip}
          >
            Skip tour
          </button>
          <div className="intro-actions__spacer" />
          {isLast ? (
            <button
              type="button"
              className="intro-button intro-button--primary"
              onClick={onFinish}
            >
              Start exploring
            </button>
          ) : (
            <button
              type="button"
              className="intro-button intro-button--primary"
              onClick={onNext}
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
