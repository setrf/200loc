interface WalkthroughControlsProps {
  canNext: boolean
  canPrev: boolean
  controlsLocked: boolean
  isPlaying: boolean
  navigationBlocked: boolean
  onApplyPrefix: () => void
  onNext: () => void
  onPlayToggle: () => void
  onPrev: () => void
}

export function WalkthroughControls({
  canNext,
  canPrev,
  controlsLocked,
  isPlaying,
  navigationBlocked,
  onApplyPrefix,
  onNext,
  onPlayToggle,
  onPrev,
}: WalkthroughControlsProps) {
  return (
    <div className="step-nav" data-lab-tour="controls" aria-label="Step controls">
      <button type="button" onClick={onApplyPrefix} disabled={controlsLocked}>
        Reset
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
        onClick={onPlayToggle}
        disabled={!canNext || navigationBlocked}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        type="button"
        className="step-nav__primary"
        onClick={onNext}
        disabled={!canNext || navigationBlocked}
      >
        Next
      </button>
    </div>
  )
}
