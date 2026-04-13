import type { LineRange, PhaseDefinition } from '../walkthrough/phases'

interface NetworkTrackerProps {
  phases: readonly PhaseDefinition[]
  activePhaseIndex: number
  contextTokens: readonly string[]
  tokenPosition: number
  sampledToken: string
  onFocusRanges: (ranges: LineRange[] | null) => void
}

const trackerMeta = [
  { label: 'Read token', group: 'context' },
  { label: 'Token vector', group: 'lookup' },
  { label: 'Position vector', group: 'lookup' },
  { label: 'Add + norm', group: 'residual' },
  { label: 'Make QKV', group: 'attention' },
  { label: 'Score slots', group: 'attention' },
  { label: 'Weight slots', group: 'attention' },
  { label: 'Mix values', group: 'attention' },
  { label: 'Write back', group: 'residual' },
  { label: 'Run MLP', group: 'compute' },
  { label: 'Score vocab', group: 'readout' },
  { label: 'Normalize', group: 'readout' },
  { label: 'Draw token', group: 'decode' },
  { label: 'Append / stop', group: 'loop' },
] as const

export function NetworkTracker({
  phases,
  activePhaseIndex,
  contextTokens,
  tokenPosition,
  sampledToken,
  onFocusRanges,
}: NetworkTrackerProps) {
  const activeMeta = trackerMeta[activePhaseIndex]
  const currentToken = contextTokens[contextTokens.length - 1] ?? 'BOS'
  const contextSummary = contextTokens
    .map((token, index) => `p${index}:${token}`)
    .join(' · ')

  return (
    <section className="panel network-tracker">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Network position</p>
          <h2>
            p{tokenPosition}:{currentToken} {'->'} p{tokenPosition + 1}
            {sampledToken === 'BOS' ? ':stop' : `:${sampledToken}`}
          </h2>
        </div>
        <p className="network-tracker__meta">
          step {activePhaseIndex + 1} / {phases.length}
        </p>
      </div>

      <p className="network-tracker__lead">
        Now doing <strong>{activeMeta.label}</strong>. Visible slots:{' '}
        <span className="network-tracker__context">{contextSummary}</span>.
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
