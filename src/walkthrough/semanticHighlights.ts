import type { GlossaryId } from './glossary'

export type SemanticHighlightTone =
  | 'input'
  | 'state'
  | 'attention'
  | 'transform'
  | 'output'

export interface SemanticHighlightSegment {
  kind: 'highlight'
  text: string
  tone: SemanticHighlightTone
}

type HighlightableSegment =
  | {
      kind: 'text'
      text: string
    }
  | {
      kind: 'term'
      text: string
      glossaryId: GlossaryId
    }

interface SemanticPhrase {
  text: string
  tone: SemanticHighlightTone
}

const semanticPhraseSeeds = [
  { text: 'current position and every earlier position', tone: 'input' },
  { text: 'one lowercase character at a time', tone: 'output' },
  { text: 'one new token at a time', tone: 'output' },
  { text: 'one character at a time', tone: 'output' },
  { text: 'current slot and its visible history', tone: 'input' },
  { text: 'current slot against earlier slots', tone: 'attention' },
  { text: 'future slots are blocked', tone: 'attention' },
  { text: 'small piece of text', tone: 'input' },
  { text: 'visible characters', tone: 'input' },
  { text: 'earlier visible text', tone: 'input' },
  { text: 'possible continuations', tone: 'output' },
  { text: 'possible next tokens', tone: 'output' },
  { text: 'hidden numeric ids', tone: 'input' },
  { text: 'raw match numbers', tone: 'attention' },
  { text: 'raw match number', tone: 'attention' },
  { text: 'search request', tone: 'attention' },
  { text: 'description card', tone: 'attention' },
  { text: 'description cards', tone: 'attention' },
  { text: 'returned vector', tone: 'attention' },
  { text: 'returned vectors', tone: 'attention' },
  { text: 'attention result', tone: 'attention' },
  { text: 'head outputs', tone: 'attention' },
  { text: 'read weights', tone: 'attention' },
  { text: 'value vectors', tone: 'attention' },
  { text: 'where to look', tone: 'attention' },
  { text: 'smart read', tone: 'attention' },
  { text: 'rescaling step', tone: 'transform' },
  { text: 'math stays stable', tone: 'transform' },
  { text: 'number by number', tone: 'transform' },
  { text: 'feed-forward block', tone: 'transform' },
  { text: 'temporary workspace', tone: 'transform' },
  { text: 'non-linear step', tone: 'transform' },
  { text: 'simple gate', tone: 'transform' },
  { text: 'learned map', tone: 'transform' },
  { text: 'local computation', tone: 'transform' },
  { text: 'running slot state', tone: 'state' },
  { text: 'main running state', tone: 'state' },
  { text: 'shared slot format', tone: 'state' },
  { text: 'earlier state', tone: 'state' },
  { text: 'slot state', tone: 'state' },
  { text: 'running state', tone: 'state' },
  { text: 'visible piece', tone: 'input' },
  { text: 'raw letters', tone: 'input' },
  { text: 'numeric labels', tone: 'input' },
  { text: 'token meaning signal', tone: 'input' },
  { text: 'position signal', tone: 'input' },
  { text: 'slot index', tone: 'input' },
  { text: 'raw preferences', tone: 'output' },
  { text: 'chosen token', tone: 'output' },
  { text: 'actual next token', tone: 'output' },
  { text: 'concrete token', tone: 'output' },
  { text: 'visible sequence', tone: 'output' },
  { text: 'raw scores', tone: 'output' },
  { text: 'raw score', tone: 'output' },
  { text: 'loops back', tone: 'output' },
] as const satisfies readonly SemanticPhrase[]

const semanticPhrases: SemanticPhrase[] = [...semanticPhraseSeeds].sort(
  (a, b) => b.text.length - a.text.length,
)

const glossaryToneById: Partial<Record<GlossaryId, SemanticHighlightTone>> = {
  llm: 'input',
  inference: 'output',
  prefix: 'input',
  context: 'input',
  'visible-history': 'input',
  slot: 'input',
  'token-id': 'input',
  vocabulary: 'input',
  token: 'input',
  vector: 'state',
  'learned-row': 'input',
  'token-table': 'input',
  bos: 'input',
  'token-embedding': 'input',
  wte: 'input',
  'position-embedding': 'input',
  'position-table': 'input',
  wpe: 'input',
  'residual-stream': 'state',
  'working-state': 'state',
  rmsnorm: 'state',
  normalization: 'transform',
  attention: 'attention',
  query: 'attention',
  key: 'attention',
  value: 'attention',
  'attention-score': 'attention',
  'causal-masking': 'attention',
  softmax: 'attention',
  'read-weight': 'attention',
  'focus-pattern': 'attention',
  'weight-table': 'transform',
  'model-width': 'state',
  'attention-head': 'attention',
  'output-projection': 'transform',
  'residual-connection': 'state',
  mlp: 'transform',
  'hidden-layer': 'transform',
  relu: 'transform',
  'lm-head': 'output',
  logit: 'output',
  temperature: 'output',
  'probability-distribution': 'output',
  sampling: 'output',
  training: 'transform',
  'seeded-sampler': 'output',
  'autoregressive-generation': 'output',
  'stop-marker': 'output',
}

function isWordLikeCharacter(value: string | undefined): boolean {
  return value !== undefined && /[a-z0-9]/i.test(value)
}

function hasWordBoundaries(text: string, index: number, length: number): boolean {
  return (
    !isWordLikeCharacter(text[index - 1]) &&
    !isWordLikeCharacter(text[index + length])
  )
}

function findNextPhraseMatch(text: string):
  | {
      index: number
      phrase: SemanticPhrase
    }
  | null {
  const lowerText = text.toLowerCase()
  let bestMatch:
    | {
        index: number
        phrase: SemanticPhrase
      }
    | null = null

  for (const phrase of semanticPhrases) {
    const lowerPhrase = phrase.text.toLowerCase()
    let searchIndex = 0

    while (searchIndex < lowerText.length) {
      const index = lowerText.indexOf(lowerPhrase, searchIndex)
      if (index === -1) {
        break
      }

      if (hasWordBoundaries(lowerText, index, lowerPhrase.length)) {
        if (
          !bestMatch ||
          index < bestMatch.index ||
          (index === bestMatch.index &&
            phrase.text.length > bestMatch.phrase.text.length)
        ) {
          bestMatch = { index, phrase }
        }
        break
      }

      searchIndex = index + 1
    }
  }

  return bestMatch
}

function highlightTextSegment(text: string): (HighlightableSegment | SemanticHighlightSegment)[] {
  const segments: (HighlightableSegment | SemanticHighlightSegment)[] = []
  let remaining = text

  while (remaining.length > 0) {
    const match = findNextPhraseMatch(remaining)

    if (!match) {
      segments.push({ kind: 'text', text: remaining })
      break
    }

    if (match.index > 0) {
      segments.push({ kind: 'text', text: remaining.slice(0, match.index) })
    }

    const highlightedText = remaining.slice(
      match.index,
      match.index + match.phrase.text.length,
    )
    segments.push({
      kind: 'highlight',
      text: highlightedText,
      tone: match.phrase.tone,
    })

    remaining = remaining.slice(match.index + match.phrase.text.length)
  }

  return segments
}

export function applySemanticHighlights<T extends HighlightableSegment>(
  segments: T[],
): (T | SemanticHighlightSegment)[] {
  return segments.flatMap((segment) =>
    segment.kind === 'text'
      ? highlightTextSegment(segment.text)
      : segment,
  ) as (T | SemanticHighlightSegment)[]
}

export function getGlossaryConceptTone(
  glossaryId: GlossaryId,
): SemanticHighlightTone | undefined {
  return glossaryToneById[glossaryId]
}
