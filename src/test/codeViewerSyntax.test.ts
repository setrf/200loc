import { describe, expect, it } from 'vitest'
import { highlightPythonSource } from '../codeViewerSyntax'

describe('code viewer syntax highlighting', () => {
  it('classifies keywords, definitions, builtins, numbers, strings, and comments', () => {
    const lines = highlightPythonSource(
      [
        '@decorator',
        'def hello(name):',
        '    print("hi", 42)  # comment',
        'class Value:',
      ].join('\n'),
    )

    expect(lines[0]?.tokens).toEqual([{ text: '@decorator', kind: 'decorator' }])
    expect(lines[1]?.tokens.some((token) => token.kind === 'keyword' && token.text === 'def')).toBe(
      true,
    )
    expect(
      lines[1]?.tokens.some((token) => token.kind === 'definition' && token.text === 'hello'),
    ).toBe(true)
    expect(lines[2]?.indentDepth).toBe(1)
    expect(lines[2]?.tokens.some((token) => token.kind === 'builtin' && token.text === 'print')).toBe(
      true,
    )
    expect(lines[2]?.tokens.some((token) => token.kind === 'string' && token.text === '"hi"')).toBe(
      true,
    )
    expect(lines[2]?.tokens.some((token) => token.kind === 'number' && token.text === '42')).toBe(
      true,
    )
    expect(
      lines[2]?.tokens.some((token) => token.kind === 'comment' && token.text.includes('comment')),
    ).toBe(true)
    expect(
      lines[3]?.tokens.some((token) => token.kind === 'definition' && token.text === 'Value'),
    ).toBe(true)
  })

  it('keeps triple-quoted strings highlighted across lines', () => {
    const lines = highlightPythonSource('"""\nhello\n"""')

    expect(lines[0]?.tokens[0]).toEqual({ text: '"""', kind: 'string' })
    expect(lines[1]?.tokens[0]).toEqual({ text: 'hello', kind: 'string' })
    expect(lines[2]?.tokens[0]).toEqual({ text: '"""', kind: 'string' })
  })

  it('supports single-quoted triple strings', () => {
    const lines = highlightPythonSource("'''\nhello\n'''")

    expect(lines[0]?.tokens[0]).toEqual({ text: "'''", kind: 'string' })
    expect(lines[1]?.tokens[0]).toEqual({ text: 'hello', kind: 'string' })
    expect(lines[2]?.tokens[0]).toEqual({ text: "'''", kind: 'string' })
  })

  it('classifies constants and self references', () => {
    const lines = highlightPythonSource('self.ready = True')

    expect(lines[0]?.tokens.some((token) => token.kind === 'self' && token.text === 'self')).toBe(
      true,
    )
    expect(
      lines[0]?.tokens.some((token) => token.kind === 'constant' && token.text === 'True'),
    ).toBe(true)
  })

  it('handles unterminated inline strings and same-line triple strings', () => {
    const lines = highlightPythonSource(["value = 'open", '"""inline"""'].join('\n'))

    expect(lines[0]?.tokens.some((token) => token.kind === 'string' && token.text === "'open")).toBe(
      true,
    )
    expect(
      lines[1]?.tokens.some((token) => token.kind === 'string' && token.text === '"""inline"""'),
    ).toBe(true)
  })

  it('keeps escaped quotes inside inline strings', () => {
    const lines = highlightPythonSource('print("a\\"b")')

    expect(
      lines[0]?.tokens.some((token) => token.kind === 'string' && token.text === '"a\\"b"'),
    ).toBe(true)
  })

  it('handles bare decorators, decimal literals, and blank lines', () => {
    const lines = highlightPythonSource(['@', 'value = 3.14', ''].join('\n'))

    expect(lines[0]?.tokens).toEqual([{ text: '@', kind: 'decorator' }])
    expect(
      lines[1]?.tokens.some((token) => token.kind === 'number' && token.text === '3.14'),
    ).toBe(true)
    expect(lines[2]?.tokens).toEqual([{ text: ' ', kind: 'plain' }])
  })
})
