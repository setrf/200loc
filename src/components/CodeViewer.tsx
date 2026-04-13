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
      <div className="code-viewer__tabs">
        <div className="code-viewer__tab is-active">
          <span className="code-viewer__tab-icon" aria-hidden="true" />
          <span>microgpt</span>
        </div>
      </div>

      <div className="code-viewer__header">
        <p className="code-viewer__breadcrumbs">assets {'>'} microgpt.py</p>
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
