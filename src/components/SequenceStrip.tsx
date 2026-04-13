interface SequenceStripProps {
  contextTokens: readonly string[]
  currentPosition: number
  sampledToken: string
  terminal: boolean
}

export function SequenceStrip({
  contextTokens,
  currentPosition,
  sampledToken,
  terminal,
}: SequenceStripProps) {
  const currentToken = contextTokens[contextTokens.length - 1] ?? 'BOS'
  const nextPosition = currentPosition + 1

  return (
    <div className="sequence-strip">
      <div className="sequence-strip__header">
        <div>
          <p className="eyebrow">Sequence</p>
          <h2>Read one slot, predict the next</h2>
        </div>
        <p className="sequence-strip__seed">deterministic seed</p>
      </div>

      <p className="sequence-strip__summary">
        Reading <strong>p{currentPosition}</strong>:{' '}
        <strong>{currentToken}</strong> to predict <strong>p{nextPosition}</strong>.
      </p>

      <div className="sequence-strip__tokens">
        {contextTokens.map((token, index) => (
          <span
            className={`sequence-strip__token ${index === currentPosition ? 'is-current' : ''}`}
            key={`${token}-${index}`}
          >
            <span className="sequence-strip__token-position">p{index}</span>
            <span>{token}</span>
          </span>
        ))}
        <span className={`sequence-strip__token ${terminal ? 'is-terminal' : 'is-next'}`}>
          <span className="sequence-strip__token-position">p{nextPosition}</span>
          <span>{sampledToken}</span>
        </span>
      </div>
    </div>
  )
}
