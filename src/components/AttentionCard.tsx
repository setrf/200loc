import type { HeadTrace } from '../model'

interface AttentionCardProps {
  heads: HeadTrace[]
}

export function AttentionCard({ heads }: AttentionCardProps) {
  return (
    <section className="panel attention-card">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Attention</p>
          <h2>Four heads, one causal window</h2>
        </div>
      </div>

      <div className="attention-card__grid">
        {heads.map((head, headIndex) => {
          const maxScore = Math.max(...head.scores.map((value) => Math.abs(value)), 1e-6)
          return (
            <div className="attention-head" key={`head-${headIndex}`}>
              <h3>Head {headIndex + 1}</h3>
              <div className="attention-head__list">
                {head.scores.map((score, index) => (
                  <div className="attention-head__row" key={`score-${headIndex}-${index}`}>
                    <span className="attention-head__token">{index}</span>
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
