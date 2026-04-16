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
    case 'welcome':
      return (
        <div className="intro-tour intro-tour--welcome" aria-hidden="true">
          <div className="intro-tour__window">
            <div className="intro-tour__window-bar">
              <span />
              <span />
              <span />
            </div>
            <div className="intro-tour__layout-strip">
              <div className="intro-tour__layout-card">
                <strong>Code</strong>
                <small>source lines</small>
              </div>
              <div className="intro-tour__layout-card">
                <strong>Story</strong>
                <small>plain language</small>
              </div>
              <div className="intro-tour__layout-card">
                <strong>Scene</strong>
                <small>visual map</small>
              </div>
            </div>
          </div>
        </div>
      )
    case 'layout':
      return (
        <div className="intro-tour intro-tour--layout" aria-hidden="true">
          <div className="intro-tour__panel intro-tour__panel--code">
            <strong>Code</strong>
            <span>what runs</span>
          </div>
          <div className="intro-tour__panel intro-tour__panel--story">
            <strong>Story</strong>
            <span>what it means</span>
          </div>
          <div className="intro-tour__panel intro-tour__panel--scene">
            <strong>Scene</strong>
            <span>where it happens</span>
          </div>
        </div>
      )
    case 'stage':
      return (
        <div className="intro-tour intro-tour--stage" aria-hidden="true">
          <div className="intro-tour__stage-chip">
            <div className="intro-tour__stage-top">
              <span>Current stage</span>
              <span>step 8 / 34</span>
            </div>
            <strong>Attention Scores</strong>
          </div>
        </div>
      )
    case 'input':
      return (
        <div className="intro-tour intro-tour--input" aria-hidden="true">
          <div className="intro-tour__field-card">
            <span>Starting text</span>
            <strong>em</strong>
          </div>
          <div className="intro-tour__cursor-line" />
          <div className="intro-tour__field-card intro-tour__field-card--soft">
            <span>Try a short prompt</span>
            <small>The walkthrough will restart only when you ask it to.</small>
          </div>
        </div>
      )
    case 'draft':
      return (
        <div className="intro-tour intro-tour--draft" aria-hidden="true">
          <div className="intro-tour__compare-card">
            <span>Starting text</span>
            <strong>emi</strong>
            <small>draft</small>
          </div>
          <div className="intro-tour__compare-arrow">Apply text</div>
          <div className="intro-tour__compare-card intro-tour__compare-card--live">
            <span>Current text</span>
            <strong>em</strong>
            <small>live run</small>
          </div>
        </div>
      )
    case 'controls':
      return (
        <div className="intro-tour intro-tour--controls" aria-hidden="true">
          {['Prev', 'Next', 'Play', 'Pause'].map((label, index) => (
            <button
              key={label}
              type="button"
              className={`intro-tour__button-pill${index === 1 ? ' is-primary' : ''}`}
              tabIndex={-1}
            >
              {label}
            </button>
          ))}
        </div>
      )
    case 'story':
      return (
        <div className="intro-tour intro-tour--story" aria-hidden="true">
          <div className="intro-tour__story-card">
            <span>Story</span>
            <strong>The model checks the small piece of text it is allowed to use.</strong>
            <p>Short explanation first. Technical detail second.</p>
          </div>
        </div>
      )
    case 'glossary':
      return (
        <div className="intro-tour intro-tour--glossary" aria-hidden="true">
          <div className="intro-tour__story-line">
            The model uses <span className="intro-tour__glossary-term">context</span> to make this choice.
          </div>
          <div className="intro-tour__popup-card">
            <strong>Context</strong>
            <p>The text the model can already see while making this step.</p>
          </div>
        </div>
      )
    case 'code':
      return (
        <div className="intro-tour intro-tour--code" aria-hidden="true">
          <div className="intro-tour__code-window">
            {[
              ['108', 'for token in visible_text:'],
              ['109', '    embed(token)'],
              ['110', '    add_position()'],
              ['111', '    run_attention()'],
            ].map(([line, text], index) => (
              <div
                key={line}
                className={`intro-tour__code-line${index === 1 || index === 2 ? ' is-active' : ''}`}
              >
                <span>{line}</span>
                <code>{text}</code>
              </div>
            ))}
          </div>
        </div>
      )
    case 'scene':
      return (
        <div className="intro-tour intro-tour--scene" aria-hidden="true">
          <div className="intro-tour__scene-surface">
            <div className="intro-tour__node intro-tour__node--left">input</div>
            <div className="intro-tour__node intro-tour__node--center">attention</div>
            <div className="intro-tour__node intro-tour__node--right">output</div>
            <svg viewBox="0 0 320 140" className="intro-tour__scene-lines">
              <path d="M70 72 C112 68 132 68 160 70" />
              <path d="M160 70 C190 72 220 72 252 72" />
            </svg>
          </div>
        </div>
      )
    case 'sync':
      return (
        <div className="intro-tour intro-tour--sync" aria-hidden="true">
          <div className="intro-tour__sync-card">Code</div>
          <div className="intro-tour__sync-card">Story</div>
          <div className="intro-tour__sync-card">Scene</div>
          <svg viewBox="0 0 320 120" className="intro-tour__sync-lines">
            <path d="M54 82 C98 34 122 34 160 58" />
            <path d="M160 58 C198 34 222 34 266 82" />
          </svg>
        </div>
      )
    case 'mobile':
      return (
        <div className="intro-tour intro-tour--mobile" aria-hidden="true">
          <div className="intro-tour__phone">
            <div className="intro-tour__phone-tabs">
              <span>Code</span>
              <span className="is-active">Story</span>
              <span>Scene</span>
            </div>
            <div className="intro-tour__phone-screen">
              <strong>Story stays readable first</strong>
              <p>Switch tabs whenever you want the other views.</p>
            </div>
          </div>
        </div>
      )
    case 'handoff':
      return (
        <div className="intro-tour intro-tour--handoff" aria-hidden="true">
          <div className="intro-tour__handoff-header">
            <span>200loc</span>
            <button type="button" tabIndex={-1}>Replay intro</button>
          </div>
          <div className="intro-tour__handoff-steps">
            <div>
              <strong>1</strong>
              <span>Read Story first</span>
            </div>
            <div>
              <strong>2</strong>
              <span>Use Next to move slowly</span>
            </div>
            <div>
              <strong>3</strong>
              <span>Peek at Code and Scene when curious</span>
            </div>
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
          <p className="intro-shell__subtitle">A quick tour of the interface before the walkthrough starts</p>
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
              <p className="eyebrow">What to notice</p>
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
