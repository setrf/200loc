import type { PhaseDefinition } from '../walkthrough/phases'
import type { ModelIdentity } from '../app/modelIdentity'

interface WalkthroughControlsProps {
  activePhaseIndex: number
  canNext: boolean
  canPrev: boolean
  controlsLocked: boolean
  currentText: string
  currentTextStatus: string
  hasPendingPrefixChange: boolean
  isPlaying: boolean
  modelIdentity: ModelIdentity
  navigationBlocked: boolean
  onApplyPrefix: () => void
  onFocusRanges: (ranges: PhaseDefinition['codeRanges'] | null) => void
  onNext: () => void
  onPlayToggle: () => void
  onPrefixChange: (value: string) => void
  onPrev: () => void
  phase: PhaseDefinition
  phaseCount: number
  prefixInput: string
}

export function WalkthroughControls({
  activePhaseIndex,
  canNext,
  canPrev,
  controlsLocked,
  currentText,
  currentTextStatus,
  hasPendingPrefixChange,
  isPlaying,
  modelIdentity,
  navigationBlocked,
  onApplyPrefix,
  onFocusRanges,
  onNext,
  onPlayToggle,
  onPrefixChange,
  onPrev,
  phase,
  phaseCount,
  prefixInput,
}: WalkthroughControlsProps) {
  return (
    <>
      <section className="model-identity" aria-label="Example model">
        <div>
          <span className="eyebrow">Example model</span>
          <strong>microgpt</strong>
        </div>
        <p>{modelIdentity.detail}</p>
        <p>{modelIdentity.summary}</p>
      </section>

      <div className="story-scene__toolbar-bar">
        <div className="story-scene__toolbar-stage">
          <div
            className="scene-panel__stage-chip"
            data-lab-tour="stage"
            tabIndex={0}
            aria-label={`Current stage: ${phase.groupTitle}, step ${activePhaseIndex + 1} of ${phaseCount}`}
            onMouseEnter={() => onFocusRanges(phase.codeRanges)}
            onMouseLeave={() => onFocusRanges(null)}
            onFocus={() => onFocusRanges(phase.codeRanges)}
            onBlur={() => onFocusRanges(null)}
          >
            <div className="scene-panel__stage-chip-main">
              <div className="scene-panel__stage-chip-copy">
                <span className="eyebrow">Current stage</span>
                <strong>{phase.groupTitle}</strong>
              </div>
              <span className="scene-panel__stage-step">
                step {activePhaseIndex + 1} / {phaseCount}
              </span>
            </div>
          </div>
        </div>

        <div className="story-panel__actions story-panel__actions--toolbar">
          <button
            type="button"
            onClick={onApplyPrefix}
            disabled={controlsLocked}
          >
            {hasPendingPrefixChange ? 'Apply text' : 'Reset'}
          </button>
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev || navigationBlocked}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext || navigationBlocked}
          >
            Next
          </button>
          <button
            type="button"
            onClick={onPlayToggle}
            disabled={!canNext || navigationBlocked}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>

      <div className="story-scene__toolbar-inputs">
        <label
          className="story-panel__field story-panel__field--editable"
          htmlFor="prefix-input"
        >
          <div className="story-panel__field-head">
            <span className="eyebrow">Name prefix</span>
          </div>
          <input
            id="prefix-input"
            className="story-panel__input"
            aria-label="Name prefix"
            value={prefixInput}
            onChange={(event) => onPrefixChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !controlsLocked) {
                onApplyPrefix()
              }
            }}
            placeholder="em"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div
          className={`story-panel__field story-panel__field--readonly${
            hasPendingPrefixChange ? ' is-stale' : ''
          }`}
        >
          <div className="story-panel__field-head">
            <span className="eyebrow">Current text</span>
            <span className="story-panel__field-status">{currentTextStatus}</span>
          </div>
          <output
            className={`story-panel__readout${currentText ? '' : ' is-empty'}`}
            aria-label="Current text"
            aria-live="polite"
          >
            {currentText || 'Nothing generated yet'}
          </output>
        </div>
      </div>

      <p className="story-panel__field-note">
        {hasPendingPrefixChange
          ? 'Current run still uses the previous name prefix. Apply text to restart microgpt from your draft.'
          : 'Edit the name prefix, then reset when you want microgpt to restart from it.'}
      </p>
    </>
  )
}
