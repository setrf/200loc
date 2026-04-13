interface SequenceStripProps {
  tokens: readonly string[]
  currentToken: string
  sampledToken: string
  terminal: boolean
}

export function SequenceStrip({
  tokens,
  currentToken,
  sampledToken,
  terminal,
}: SequenceStripProps) {
  return (
    <section className="panel sequence-strip">
      <div className="sequence-strip__header">
        <div>
          <p className="eyebrow">Sequence</p>
          <h2>Context and next token</h2>
        </div>
        <p className="sequence-strip__seed">deterministic seed</p>
      </div>

      <div className="sequence-strip__tokens">
        {tokens.length === 0 ? <span className="sequence-strip__empty">BOS</span> : null}
        {tokens.map((token, index) => (
          <span className="sequence-strip__token" key={`${token}-${index}`}>
            {token}
          </span>
        ))}
        <span className="sequence-strip__token is-current">{currentToken}</span>
        <span className={`sequence-strip__token ${terminal ? 'is-terminal' : 'is-next'}`}>
          {sampledToken}
        </span>
      </div>
    </section>
  )
}
