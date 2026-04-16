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
          <p className="intro-step__meta">
            Step {activeStepIndex + 1} of {steps.length} · {step.title}
          </p>
          <div className="intro-step__lines">
            {step.lines.map((line) => (
              <p className="intro-step__line" key={`${step.id}-${line}`}>
                {line}
              </p>
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
