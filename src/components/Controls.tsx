import type { BackendName, PrefixNormalization } from '../model'

interface ControlsProps {
  prefix: string
  normalization: PrefixNormalization
  backend: BackendName
  fallbackReason?: string
  phaseTitle: string
  tokenPosition: number
  playing: boolean
  canPrev: boolean
  canNext: boolean
  onPrefixChange: (value: string) => void
  onReset: () => void
  onPrev: () => void
  onNext: () => void
  onTogglePlay: () => void
}

export function Controls({
  prefix,
  normalization,
  backend,
  fallbackReason,
  phaseTitle,
  tokenPosition,
  playing,
  canPrev,
  canNext,
  onPrefixChange,
  onReset,
  onPrev,
  onNext,
  onTogglePlay,
}: ControlsProps) {
  const helper = normalization.removedUnsupported
    ? 'Only lowercase a-z are kept.'
    : normalization.truncated
      ? 'Prefix was capped at 15 characters.'
      : 'Lowercase a-z only. Empty means BOS.'

  return (
    <section className="panel controls-panel">
      <div className="controls-panel__intro">
        <div>
          <p className="eyebrow">Walkthrough</p>
          <h2>{phaseTitle}</h2>
        </div>
        <div className={`backend-badge backend-badge--${backend}`}>
          {backend === 'webgpu' ? 'WebGPU' : 'CPU fallback'}
        </div>
      </div>

      <label className="controls-panel__label" htmlFor="prefix-input">
        Prefix
      </label>
      <input
        id="prefix-input"
        className="controls-panel__input"
        value={prefix}
        onChange={(event) => onPrefixChange(event.target.value)}
        placeholder="em"
        autoComplete="off"
        spellCheck={false}
      />
      <p className="controls-panel__helper">{helper}</p>

      <div className="controls-panel__stats">
        <span>Token position {tokenPosition}</span>
        <span>1 layer · 4 heads · 16 dim · char-level</span>
      </div>

      <div className="controls-panel__actions">
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

      {fallbackReason ? (
        <p className="controls-panel__fallback">{fallbackReason}</p>
      ) : null}
    </section>
  )
}
