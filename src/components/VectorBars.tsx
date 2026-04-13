interface VectorBarsProps {
  values: readonly number[]
  limit?: number
  label?: string
  compact?: boolean
}

export function VectorBars({
  values,
  limit = values.length,
  label,
  compact = false,
}: VectorBarsProps) {
  const visible = values.slice(0, limit)
  const maxAbs = Math.max(...visible.map((value) => Math.abs(value)), 1e-6)

  return (
    <div className={`vector-bars ${compact ? 'vector-bars--compact' : ''}`}>
      {label ? <div className="vector-bars__label">{label}</div> : null}
      <div className="vector-bars__list">
        {visible.map((value, index) => (
          <div className="vector-bars__row" key={`${label ?? 'vec'}-${index}`}>
            <span className="vector-bars__index">{index}</span>
            <div className="vector-bars__track">
              <div
                className={`vector-bars__fill ${value >= 0 ? 'is-positive' : 'is-negative'}`}
                style={{
                  width: `${(Math.abs(value) / maxAbs) * 100}%`,
                }}
              />
            </div>
            <span className="vector-bars__value">{value.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
