import { useLayoutEffect, useRef } from 'react'
import type { LineRange } from '../walkthrough/phases'
import { highlightPythonSource } from '../codeViewerSyntax'

interface CodeViewerProps {
  source: string
  activeRanges: LineRange[]
}

function isLineActive(lineNumber: number, activeRanges: LineRange[]) {
  return activeRanges.some(
    (range) => lineNumber >= range.start && lineNumber <= range.end,
  )
}

function firstActiveLineNumber(activeRanges: LineRange[]) {
  return activeRanges.reduce<number | null>((first, range) => {
    if (first == null) {
      return range.start
    }
    return Math.min(first, range.start)
  }, null)
}

export function CodeViewer({ source, activeRanges }: CodeViewerProps) {
  const lines = source.split('\n')
  const highlightedLines = highlightPythonSource(source)
  const linesRef = useRef<HTMLOListElement | null>(null)
  const lineRefs = useRef(new Map<number, HTMLLIElement>())

  useLayoutEffect(() => {
    const activeLineNumber = firstActiveLineNumber(activeRanges)
    const container = linesRef.current
    const target = activeLineNumber != null ? lineRefs.current.get(activeLineNumber) : null
    if (!container || !target) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const hasMeasurableViewport = containerRect.height > 0
    const isVisible =
      hasMeasurableViewport &&
      targetRect.top >= containerRect.top + 8 &&
      targetRect.bottom <= containerRect.bottom - 8

    if (!isVisible && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeRanges])

  return (
    <div className="code-viewer">
      <div className="code-viewer__header">
        <div className="code-viewer__file">
          <strong className="code-viewer__filename">microgpt.py</strong>
        </div>
        <div className="code-viewer__meta-group">
          <span className="code-viewer__language">Python</span>
          <p className="code-viewer__meta">{lines.length} lines</p>
        </div>
      </div>

      <ol className="code-viewer__lines" ref={linesRef}>
        {highlightedLines.map((line, index) => {
          const lineNumber = index + 1
          const active = isLineActive(lineNumber, activeRanges)
          return (
            <li
              className={`code-viewer__line ${active ? 'is-active' : ''}`}
              key={lineNumber}
              ref={(node) => {
                if (node) {
                  lineRefs.current.set(lineNumber, node)
                } else {
                  lineRefs.current.delete(lineNumber)
                }
              }}
            >
              <span className="code-viewer__line-no">{lineNumber}</span>
              <code
                className="code-viewer__code"
                style={{ ['--indent-depth' as string]: String(line.indentDepth) }}
              >
                {line.tokens.map((token, tokenIndex) => (
                  <span
                    key={`${lineNumber}-${tokenIndex}`}
                    className={`code-viewer__token code-viewer__token--${token.kind}`}
                  >
                    {token.text}
                  </span>
                ))}
              </code>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
