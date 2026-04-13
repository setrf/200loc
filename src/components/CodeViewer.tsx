import type { LineRange } from '../walkthrough/phases'

interface CodeViewerProps {
  source: string
  activeRanges: LineRange[]
}

function isLineActive(lineNumber: number, activeRanges: LineRange[]) {
  return activeRanges.some(
    (range) => lineNumber >= range.start && lineNumber <= range.end,
  )
}

export function CodeViewer({ source, activeRanges }: CodeViewerProps) {
  const lines = source.split('\n')

  return (
    <div className="code-viewer">
      <div className="code-viewer__header">
        <div>
          <p className="eyebrow">Canonical source</p>
          <h2>Karpathy’s exact `microgpt.py`</h2>
        </div>
        <p className="code-viewer__meta">{lines.length} lines</p>
      </div>

      <ol className="code-viewer__lines">
        {lines.map((line, index) => {
          const lineNumber = index + 1
          const active = isLineActive(lineNumber, activeRanges)
          return (
            <li
              className={`code-viewer__line ${active ? 'is-active' : ''}`}
              key={lineNumber}
            >
              <span className="code-viewer__line-no">{lineNumber}</span>
              <code>{line || ' '}</code>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
