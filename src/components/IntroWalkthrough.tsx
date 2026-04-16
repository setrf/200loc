import type { IntroStepDefinition } from '../intro/steps'

interface IntroWalkthroughProps {
  activeStepIndex: number
  steps: IntroStepDefinition[]
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  onOpenLab: () => void
  labStatusLabel: string
}

export function IntroWalkthrough({
  activeStepIndex,
  steps,
  onBack,
  onNext,
  onSkip,
  onOpenLab,
  labStatusLabel,
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
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={onSkip}
        >
          Skip
        </button>
      </header>

      <main className="intro-layout">
        <section className="intro-panel intro-panel--copy" aria-label="Intro step">
          <p className="eyebrow">
            Step {activeStepIndex + 1} of {steps.length}
          </p>
          <h2>{step.title}</h2>
          <p className="intro-panel__body">{step.body}</p>
          {step.note ? <p className="intro-panel__note">{step.note}</p> : null}
        </section>

        <section className="intro-panel intro-panel--visual" aria-label="Intro example">
          <div className="intro-visual">
            <h3>{step.visualTitle}</h3>
            {step.visualRows.map((row) => (
              <div className="intro-visual__row" key={`${step.id}-${row.label}`}>
                <span className="intro-visual__label">{row.label}</span>
                <div className="intro-visual__values">
                  {row.values.map((value, index) => {
                    const emphasized = row.emphasisIndexes?.includes(index) ?? false
                    return (
                      <span
                        className={`intro-visual__chip${emphasized ? ' is-emphasis' : ''}`}
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
          <p className="intro-panel__status">Live walkthrough status: {labStatusLabel}</p>
        </section>
      </main>

      <footer className="intro-actions">
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
      </footer>
    </div>
  )
}
