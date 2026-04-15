import type { TechnicalTerm } from '../walkthrough/phases'

interface ControlsProps {
  plainSummary: string
  whatHappens: string
  whyItMatters: string
  technicalTerms: TechnicalTerm[]
  sceneReading: string
  codeConnection: string
}

export function Controls({
  plainSummary,
  whatHappens,
  whyItMatters,
  technicalTerms,
  sceneReading,
  codeConnection,
}: ControlsProps) {
  return (
    <div className="story-panel">
      <div className="story-panel__copy">
        <div className="story-panel__copy-section">
          <p className="story-panel__copy-heading">Plain summary</p>
          <p className="story-panel__summary">{plainSummary}</p>
        </div>
        <div className="story-panel__copy-section">
          <p className="story-panel__copy-heading">What the model is doing</p>
          <p>{whatHappens}</p>
        </div>
        <div className="story-panel__copy-section">
          <p className="story-panel__copy-heading">Why this exists</p>
          <p className="story-panel__why">{whyItMatters}</p>
        </div>
        {technicalTerms.length > 0 ? (
          <div className="story-panel__copy-section">
            <p className="story-panel__copy-heading">New terms in this step</p>
            <ul className="story-panel__terms">
              {technicalTerms.map((term) => (
                <li key={term.term}>
                  <strong>{term.plainName}</strong>
                  <span>
                    {term.term}: {term.definition}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="story-panel__copy-section">
          <p className="story-panel__copy-heading">How to read the scene</p>
          <p>{sceneReading}</p>
        </div>
        <div className="story-panel__copy-section">
          <p className="story-panel__copy-heading">How this maps to the code</p>
          <p>{codeConnection}</p>
        </div>
      </div>
    </div>
  )
}
