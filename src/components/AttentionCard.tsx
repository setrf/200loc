import type { HeadTrace } from '../model'

interface AttentionCardProps {
  heads: HeadTrace[]
  slotLabels: readonly string[]
  currentToken: string
  currentPosition: number
}

export function AttentionCard({
  heads,
  slotLabels,
  currentToken,
  currentPosition,
}: AttentionCardProps) {
  return (
    <section className="panel attention-card">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Attention</p>
          <h2>
            Reading p{currentPosition}:{currentToken} against visible slots
          </h2>
        </div>
      </div>

      <div className="attention-card__grid">
        {heads.map((head, headIndex) => {
          const maxScore = Math.max(...head.scores.map((value) => Math.abs(value)), 1e-6)
          const strongestWeight = Math.max(...head.weights)
          const strongestIndex = head.weights.findIndex((value) => value === strongestWeight)
          return (
            <div className="attention-head" key={`head-${headIndex}`}>
              <h3>Head {headIndex + 1}</h3>
              <p className="attention-head__summary">
                strongest read {slotLabels[strongestIndex] ?? `p${strongestIndex}`}{' '}
                ({strongestWeight.toFixed(3)})
              </p>
              <div className="attention-head__list">
                {head.scores.map((score, index) => (
                  <div className="attention-head__row" key={`score-${headIndex}-${index}`}>
                    <span className="attention-head__token">
                      {slotLabels[index] ?? `p${index}`}
                    </span>
                    <div className="attention-head__metrics">
                      <div className="attention-head__track">
                        <div
                          className="attention-head__fill attention-head__fill--score"
                          style={{ width: `${(Math.abs(score) / maxScore) * 100}%` }}
                        />
                      </div>
                      <div className="attention-head__track">
                        <div
                          className="attention-head__fill attention-head__fill--weight"
                          style={{ width: `${head.weights[index] * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="attention-head__value">
                      {head.weights[index].toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
