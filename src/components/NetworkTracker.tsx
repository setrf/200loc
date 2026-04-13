import type { LineRange, PhaseDefinition } from '../walkthrough/phases'

interface NetworkTrackerProps {
  phases: readonly PhaseDefinition[]
  activePhaseIndex: number
  tokenPosition: number
  onFocusRanges: (ranges: LineRange[] | null) => void
}

const trackerMeta = [
  { label: 'Input', group: 'context' },
  { label: 'Tok vec', group: 'lookup' },
  { label: 'Pos vec', group: 'lookup' },
  { label: 'Add + norm', group: 'residual' },
  { label: 'QKV', group: 'attention' },
  { label: 'Scores', group: 'attention' },
  { label: 'Weights', group: 'attention' },
  { label: 'Value mix', group: 'attention' },
  { label: 'Attn out', group: 'residual' },
  { label: 'MLP', group: 'compute' },
  { label: 'Logits', group: 'readout' },
  { label: 'Prob', group: 'readout' },
  { label: 'Sample', group: 'decode' },
  { label: 'Append', group: 'loop' },
] as const

export function NetworkTracker({
  phases,
  activePhaseIndex,
  tokenPosition,
  onFocusRanges,
}: NetworkTrackerProps) {
  const activeMeta = trackerMeta[activePhaseIndex]

  return (
    <section className="panel network-tracker">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Network position</p>
          <h2>Token position {tokenPosition} inside the model</h2>
        </div>
        <p className="network-tracker__meta">
          step {activePhaseIndex + 1} / {phases.length}
        </p>
      </div>

      <p className="network-tracker__lead">
        Now in <strong>{activeMeta.label}</strong>. This is the model location
        for the current walkthrough phase.
      </p>

      <ol className="network-tracker__path">
        {phases.map((phase, index) => {
          const meta = trackerMeta[index]
          const state =
            index < activePhaseIndex
              ? 'is-complete'
              : index === activePhaseIndex
                ? 'is-active'
                : 'is-upcoming'

          return (
            <li
              key={phase.id}
              className={`network-tracker__item ${state}`}
              aria-current={index === activePhaseIndex ? 'step' : undefined}
              onMouseEnter={() => onFocusRanges(phase.codeRanges)}
              onMouseLeave={() => onFocusRanges(null)}
            >
              <span className="network-tracker__group">{meta.group}</span>
              <span className="network-tracker__label">{meta.label}</span>
              <span className="network-tracker__index">
                {String(index + 1).padStart(2, '0')}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
