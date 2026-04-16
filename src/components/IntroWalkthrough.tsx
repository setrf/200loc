import type { IntroStepDefinition } from '../intro/steps'

interface IntroWalkthroughProps {
  activeStepIndex: number
  steps: IntroStepDefinition[]
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  onOpenLab: () => void
}

export function IntroWalkthrough({
  activeStepIndex,
  steps,
  onBack,
  onNext,
  onSkip,
  onOpenLab,
}: IntroWalkthroughProps) {
  const step = steps[activeStepIndex]!
  const isFirst = activeStepIndex === 0
  const isLast = activeStepIndex === steps.length - 1

  return (
    <div className="intro-shell">
      <header className="intro-shell__header">
        <div>
          <p className="eyebrow">200loc</p>
          <h1>How LLM systems actually work</h1>
          <p className="intro-shell__lede">
            A plain walk through of what a language model is doing when it writes the next token.
          </p>
        </div>
        <button
          type="button"
          className="ghost-button ghost-button--quiet"
          onClick={onSkip}
        >
          Skip
        </button>
      </header>

      <main className="intro-stack">
        <section className="intro-step" aria-label="Intro step">
          <div className="intro-step__progress">
            <p className="eyebrow">
              Step {activeStepIndex + 1} of {steps.length}
            </p>
            <div
              className="intro-step__progress-bar"
              aria-hidden="true"
            >
              <span
                style={{
                  width: `${((activeStepIndex + 1) / steps.length) * 100}%`,
                }}
              />
            </div>
          </div>
          <p className="intro-step__kicker">One idea at a time</p>
          <h2>{step.title}</h2>
          <p className="intro-step__body">{step.body}</p>
          {step.note ? <p className="intro-step__note">{step.note}</p> : null}
        </section>

        <section className="intro-example" aria-label="Intro example">
          <h3>{step.visualTitle}</h3>
          <div className="intro-example__rows">
            {step.visualRows.map((row) => (
              <div className="intro-example__row" key={`${step.id}-${row.label}`}>
                <span className="intro-example__label">{row.label}</span>
                <div className="intro-example__values">
                  {row.values.map((value, index) => {
                    const emphasized = row.emphasisIndexes?.includes(index) ?? false
                    return (
                      <span
                        className={`intro-example__value${emphasized ? ' is-emphasis' : ''}`}
                        key={`${row.label}-${value}-${index}`}
                      >
                        {value}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="intro-actions" aria-label="Intro navigation">
          <button type="button" onClick={onBack} disabled={isFirst}>
            Back
          </button>
          <div className="intro-actions__spacer" />
          {isLast ? (
            <button type="button" onClick={onOpenLab}>
              Open live walkthrough
            </button>
          ) : (
            <button type="button" onClick={onNext}>
              Next
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
