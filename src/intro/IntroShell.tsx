import { useEffect, useMemo, useRef, useState } from 'react'
import type { IntroState } from './reducer'
import type { IntroStepDefinition } from './steps'

interface IntroShellProps {
  state: IntroState
  steps: readonly IntroStepDefinition[]
  walkthroughReady: boolean
  onNext: () => void
  onPrev: () => void
  onSkip: () => void
  onFinish: () => void
}

function useReducedMotionPreference() {
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => {
      media.removeEventListener('change', update)
    }
  }, [])

  return reducedMotion
}

function renderVisual(step: IntroStepDefinition) {
  switch (step.visualKind) {
    case 'hero':
      return (
        <div className="intro-visual intro-visual--hero" aria-hidden="true">
          <div className="intro-visual__chip">Prompt</div>
          <div className="intro-visual__flow-line" />
          <div className="intro-visual__stack">
            <span>visible text</span>
            <span>many guesses</span>
            <span>one next piece</span>
          </div>
          <div className="intro-visual__beam" />
        </div>
      )
    case 'contrast':
      return (
        <div className="intro-visual intro-visual--contrast" aria-hidden="true">
          <div className="intro-visual__card intro-visual__card--good">
            <strong>Prediction engine</strong>
            <span>trained on patterns</span>
          </div>
          <div className="intro-visual__divider">not</div>
          <div className="intro-visual__card intro-visual__card--muted">
            <strong>Person or lookup table</strong>
            <span>no guaranteed truth</span>
          </div>
        </div>
      )
    case 'handoff':
      return (
        <div className="intro-visual intro-visual--handoff" aria-hidden="true">
          <div className="intro-visual__panel">
            <span>Code</span>
          </div>
          <div className="intro-visual__panel">
            <span>Story</span>
          </div>
          <div className="intro-visual__panel">
            <span>Scene</span>
          </div>
        </div>
      )
  }
}

export function IntroShell({
  state,
  steps,
  walkthroughReady,
  onNext,
  onPrev,
  onSkip,
  onFinish,
}: IntroShellProps) {
  const reducedMotion = useReducedMotionPreference()
  const titleRef = useRef<HTMLHeadingElement | null>(null)
  const step = steps[state.activeStepIndex] ?? steps[0]
  const isLastStep = state.activeStepIndex === steps.length - 1
  const progressItems = useMemo(
    () =>
      steps.map((item, index) => ({
        id: item.id,
        active: index === state.activeStepIndex,
        complete: index < state.activeStepIndex,
      })),
    [state.activeStepIndex, steps],
  )

  useEffect(() => {
    titleRef.current?.focus()
  }, [state.activeStepIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (isLastStep) {
          if (walkthroughReady) {
            onFinish()
          }
          return
        }
        onNext()
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrev()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLastStep, onFinish, onNext, onPrev, walkthroughReady])

  return (
    <div
      className={`intro-shell${reducedMotion ? ' is-reduced-motion' : ''}`}
      data-testid="intro-shell"
    >
      <header className="intro-shell__header">
        <div>
          <p className="eyebrow">200loc</p>
          <p className="intro-shell__subtitle">A guided introduction before the deep walkthrough</p>
        </div>
        <button
          type="button"
          className="intro-shell__skip"
          onClick={onSkip}
        >
          Skip intro
        </button>
      </header>

      <main className="intro-shell__main">
        <div className="intro-shell__progress">
          <span className="intro-shell__progress-label">
            Step {state.activeStepIndex + 1} of {steps.length}
          </span>
          <div className="intro-shell__progress-rail" aria-hidden="true">
            {progressItems.map((item) => (
              <span
                key={item.id}
                className={`intro-shell__progress-dot${
                  item.active ? ' is-active' : item.complete ? ' is-complete' : ''
                }`}
              />
            ))}
          </div>
        </div>

        <section className="intro-step-card">
          <div className="intro-step-card__copy">
            <p className="eyebrow">{step.eyebrow}</p>
            <h1
              ref={titleRef}
              className="intro-step-card__title"
              tabIndex={-1}
            >
              {step.title}
            </h1>
            <div className="intro-step-card__body">
              {step.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            <p className="intro-step-card__status">
              {walkthroughReady
                ? 'The detailed walkthrough is ready whenever you are.'
                : 'Preparing the detailed walkthrough in the background…'}
            </p>
          </div>

          <div className="intro-step-card__visual-panel">
            <div className="intro-step-card__visual-copy">
              <p className="eyebrow">Visual cue</p>
              <strong>{step.visualTitle}</strong>
              <p>{step.visualBody}</p>
            </div>
            {renderVisual(step)}
          </div>
        </section>
      </main>

      <footer className="intro-shell__footer">
        <button
          type="button"
          onClick={onPrev}
          disabled={state.activeStepIndex === 0}
        >
          Back
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={onFinish}
            disabled={!walkthroughReady}
          >
            {walkthroughReady ? 'Start the deep walkthrough' : 'Preparing walkthrough…'}
          </button>
        ) : (
          <button type="button" onClick={onNext}>
            {step.primaryActionLabel ?? 'Next'}
          </button>
        )}
      </footer>
    </div>
  )
}
