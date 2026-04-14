// Lightweight Python highlighting for the in-app source viewer.
export type SyntaxTokenKind =
  | 'plain'
  | 'keyword'
  | 'builtin'
  | 'string'
  | 'comment'
  | 'number'
  | 'decorator'
  | 'definition'
  | 'constant'
  | 'self'

export interface SyntaxToken {
  text: string
  kind: SyntaxTokenKind
}

export interface HighlightedLine {
  indentDepth: number
  tokens: SyntaxToken[]
}

const KEYWORDS = new Set([
  'and',
  'as',
  'assert',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

const BUILTINS = new Set([
  'enumerate',
  'float',
  'int',
  'isinstance',
  'len',
  'list',
  'max',
  'min',
  'open',
  'print',
  'range',
  'reversed',
  'set',
  'sorted',
  'str',
  'sum',
  'zip',
])

const CONSTANTS = new Set(['False', 'None', 'True'])

interface TokenizeState {
  tripleQuote: "'''" | '"""' | null
}

function pushToken(tokens: SyntaxToken[], text: string, kind: SyntaxTokenKind) {
  /* v8 ignore next -- tokenizer only passes matched non-empty fragments */
  if (!text) {
    return
  }

  const previous = tokens[tokens.length - 1]
  if (previous && previous.kind === kind) {
    previous.text += text
    return
  }

  tokens.push({ text, kind })
}

function consumeInlineString(line: string, start: number, quote: "'" | '"') {
  let index = start + 1
  while (index < line.length) {
    const char = line[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === quote) {
      return { text: line.slice(start, index + 1), nextIndex: index + 1 }
    }
    index += 1
  }
  return { text: line.slice(start), nextIndex: line.length }
}

function consumeTripleString(
  line: string,
  start: number,
  quote: "'''" | '"""',
  state: TokenizeState,
) {
  const end = line.indexOf(quote, start + 3)
  if (end === -1) {
    state.tripleQuote = quote
    return { text: line.slice(start), nextIndex: line.length }
  }

  return {
    text: line.slice(start, end + 3),
    nextIndex: end + 3,
  }
}

function tokenizePythonLine(line: string, state: TokenizeState): HighlightedLine {
  const tokens: SyntaxToken[] = []
  const indentMatch = line.match(/^\s*/)
  const indent = indentMatch?.[0] ?? ''
  const indentDepth = Math.floor(indent.replace(/\t/g, '    ').length / 4)
  let index = 0
  let expectDefinition = false

  while (index < line.length) {
    if (state.tripleQuote) {
      const closeIndex = line.indexOf(state.tripleQuote, index)
      if (closeIndex === -1) {
        pushToken(tokens, line.slice(index), 'string')
        return { indentDepth, tokens }
      }

      pushToken(tokens, line.slice(index, closeIndex + 3), 'string')
      index = closeIndex + 3
      state.tripleQuote = null
      continue
    }

    const rest = line.slice(index)

    if (/^\s+/.test(rest)) {
      const text = rest.match(/^\s+/)?.[0] ?? ''
      pushToken(tokens, text, 'plain')
      index += text.length
      continue
    }

    if (rest.startsWith('#')) {
      pushToken(tokens, rest, 'comment')
      break
    }

    if (rest.startsWith("'''") || rest.startsWith('"""')) {
      const quote = rest.startsWith("'''") ? "'''" : '"""'
      const { text, nextIndex } = consumeTripleString(line, index, quote, state)
      pushToken(tokens, text, 'string')
      index = nextIndex
      continue
    }

    if (rest[0] === "'" || rest[0] === '"') {
      const { text, nextIndex } = consumeInlineString(line, index, rest[0] as "'" | '"')
      pushToken(tokens, text, 'string')
      index = nextIndex
      continue
    }

    if (rest[0] === '@') {
      const text = rest.match(/^@[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? '@'
      pushToken(tokens, text, 'decorator')
      index += text.length
      continue
    }

    if (/^\d+(\.\d+)?/.test(rest)) {
      const text = rest.match(/^\d+(\.\d+)?/)?.[0] ?? ''
      pushToken(tokens, text, 'number')
      index += text.length
      continue
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*/.test(rest)) {
      const text = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0] ?? ''
      let kind: SyntaxTokenKind = 'plain'

      if (expectDefinition) {
        kind = 'definition'
        expectDefinition = false
      } else if (KEYWORDS.has(text)) {
        kind = 'keyword'
        expectDefinition = text === 'def' || text === 'class'
      } else if (BUILTINS.has(text)) {
        kind = 'builtin'
      } else if (CONSTANTS.has(text)) {
        kind = 'constant'
      } else if (text === 'self') {
        kind = 'self'
      }

      pushToken(tokens, text, kind)
      index += text.length
      continue
    }

    pushToken(tokens, rest[0]!, 'plain')
    index += 1
  }

  return { indentDepth, tokens: tokens.length ? tokens : [{ text: ' ', kind: 'plain' }] }
}

export function highlightPythonSource(source: string) {
  const state: TokenizeState = { tripleQuote: null }
  return source.split('\n').map((line) => tokenizePythonLine(line, state))
}
