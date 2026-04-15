import type { BackendName, PrefixNormalization } from '../model'
import type { AppendixSection, LineRange } from '../walkthrough/phases'

interface ControlsProps {
  prefix: string
  normalization: PrefixNormalization
  backend: BackendName
  fallbackReason?: string
  phaseTitle: string
  phaseStep: number
  phaseCount: number
  transitionLabel: string
  explanationTitle: string
  explanationBody: string
  explanationWhy: string
  codeRanges: LineRange[]
  appendixOpen: boolean
  appendixSections: AppendixSection[]
  playing: boolean
  canPrev: boolean
  canNext: boolean
  onPrefixChange: (value: string) => void
  onReset: () => void
  onPrev: () => void
  onNext: () => void
  onTogglePlay: () => void
  onToggleAppendix: () => void
  onFocusRanges: (ranges: LineRange[] | null) => void
}

function formatRanges(ranges: LineRange[]) {
  return ranges
    .map((range) =>
      range.start === range.end
        ? `L${range.start}`
        : `L${range.start}-${range.end}`,
    )
    .join(', ')
}

export function Controls({
  prefix,
  normalization,
  backend,
  fallbackReason,
  phaseTitle,
  phaseStep,
  phaseCount,
  transitionLabel,
  explanationTitle,
  explanationBody,
  explanationWhy,
  codeRanges,
  appendixOpen,
  appendixSections,
  playing,
  canPrev,
  canNext,
  onPrefixChange,
  onReset,
  onPrev,
  onNext,
  onTogglePlay,
  onToggleAppendix,
  onFocusRanges,
}: ControlsProps) {
  const helper = normalization.removedUnsupported
    ? 'Only lowercase a-z are kept.'
    : normalization.truncated
      ? 'Prefix was capped at 15 characters.'
      : 'Lowercase a-z only. Empty means BOS.'

  return (
    <div className="story-panel">
      <div className="story-panel__topline">
        <p className="eyebrow">200loc</p>
        <div className="story-panel__badges">
          <span
            className={`backend-badge backend-badge--${backend}`}
            onMouseEnter={() => onFocusRanges(codeRanges)}
            onMouseLeave={() => onFocusRanges(null)}
          >
            {backend === 'webgpu' ? 'WebGPU' : 'CPU fallback'}
          </span>
          <span
            className="story-panel__badge"
            onMouseEnter={() => onFocusRanges(codeRanges)}
            onMouseLeave={() => onFocusRanges(null)}
          >
            step {phaseStep} / {phaseCount}
          </span>
        </div>
      </div>

      <div className="story-panel__header">
        <div
          className="story-panel__phase-chip"
          onMouseEnter={() => onFocusRanges(codeRanges)}
          onMouseLeave={() => onFocusRanges(null)}
        >
          <span className="eyebrow">Current phase</span>
          <strong>{phaseTitle}</strong>
          <span>{formatRanges(codeRanges)}</span>
        </div>
      </div>

      <div className="story-panel__controls">
        <label className="story-panel__field" htmlFor="prefix-input">
          <span className="eyebrow">Prefix</span>
          <input
            id="prefix-input"
            className="story-panel__input"
            value={prefix}
            onChange={(event) => onPrefixChange(event.target.value)}
            placeholder="em"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="story-panel__actions">
          <button type="button" onClick={onReset}>
            Reset
          </button>
          <button type="button" onClick={onPrev} disabled={!canPrev}>
            Prev
          </button>
          <button type="button" onClick={onNext} disabled={!canNext}>
            Next
          </button>
          <button type="button" onClick={onTogglePlay} disabled={!canNext}>
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>

      <p className="story-panel__helper">{helper}</p>

      <div
        className="story-panel__transition"
        onMouseEnter={() => onFocusRanges(codeRanges)}
        onMouseLeave={() => onFocusRanges(null)}
      >
        <span className="eyebrow">Current read</span>
        <strong>{transitionLabel}</strong>
        <span>1 layer · 4 heads · 16 dim · char-level</span>
      </div>

      <div className="story-panel__copy">
        <p className="story-panel__copy-title">{explanationTitle}</p>
        <p>{explanationBody}</p>
        <p className="story-panel__why">{explanationWhy}</p>
      </div>

      {fallbackReason ? (
        <p className="story-panel__fallback">{fallbackReason}</p>
      ) : null}

      <div className="story-panel__appendix">
        <button type="button" className="story-panel__appendix-toggle" onClick={onToggleAppendix}>
          {appendixOpen ? 'Hide training note' : 'Show training note'}
        </button>

        {appendixOpen ? (
          <div className="story-panel__appendix-body">
            <p>
              The browser only runs inference. These offline steps explain where
              the weights came from.
            </p>
            <ul>
              {appendixSections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    onMouseEnter={() => onFocusRanges(section.codeRanges)}
                    onMouseLeave={() => onFocusRanges(null)}
                  >
                    <strong>{section.title}</strong>
                    <span>{section.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  )
}
