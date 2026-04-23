import { Fragment, useLayoutEffect, useRef } from 'react'
import type { LineRange } from '../walkthrough/phases'
import { highlightPythonSource } from '../codeViewerSyntax'

interface CodeViewerProps {
  source: string
  activeRanges: LineRange[]
  codeExplainer: string
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

export function CodeViewer({ source, activeRanges, codeExplainer }: CodeViewerProps) {
  const lines = source.split('\n')
  const highlightedLines = highlightPythonSource(source)
  const activeLineNumber = firstActiveLineNumber(activeRanges)
  const trimmedCodeExplainer = codeExplainer.trim()
  const linesRef = useRef<HTMLOListElement | null>(null)
  const lineRefs = useRef(new Map<number, HTMLLIElement>())
  const explainerRef = useRef<HTMLLIElement | null>(null)

  useLayoutEffect(() => {
    const container = linesRef.current
    const target = activeLineNumber != null ? lineRefs.current.get(activeLineNumber) : null
    if (!container || !target) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const noteRect = explainerRef.current?.getBoundingClientRect() ?? targetRect
    const hasMeasurableViewport = containerRect.height > 0
    const isVisible =
      hasMeasurableViewport &&
      noteRect.top >= containerRect.top + 8 &&
      targetRect.bottom <= containerRect.bottom - 8

    if (!isVisible && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [activeLineNumber, activeRanges, trimmedCodeExplainer])

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
          const showExplainer =
            lineNumber === activeLineNumber && trimmedCodeExplainer.length > 0
          return (
            <Fragment key={lineNumber}>
              {showExplainer ? (
                <li
                  className="code-viewer__explainer"
                  aria-label="Code explainer"
                  ref={explainerRef}
                >
                  <span className="code-viewer__explainer-label">Code</span>
                  <p className="code-viewer__explainer-copy">
                    {trimmedCodeExplainer}
                  </p>
                </li>
              ) : null}
              <li
                className={`code-viewer__line ${active ? 'is-active' : ''}`}
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
            </Fragment>
          )
        })}
      </ol>
    </div>
  )
}
