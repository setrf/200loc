import type { GlossaryId } from './glossary'

export type AutoGlossarySegment =
  | {
      kind: 'text'
      text: string
    }
  | {
      kind: 'term'
      text: string
      glossaryId: GlossaryId
    }

const autoTerms: { glossaryId: GlossaryId; pattern: RegExp }[] = [
  { glossaryId: 'autoregressive-generation', pattern: /\bone (?:token|character) at a time\b/i },
  { glossaryId: 'probability-distribution', pattern: /\bprobability distribution\b/i },
  { glossaryId: 'probability-distribution', pattern: /\bprobabilities\b/i },
  { glossaryId: 'position-embedding', pattern: /\bposition embedding\b/i },
  { glossaryId: 'token-embedding', pattern: /\btoken embedding\b/i },
  { glossaryId: 'visible-history', pattern: /\bvisible history\b/i },
  { glossaryId: 'residual-connection', pattern: /\bresidual add\b/i },
  { glossaryId: 'residual-connection', pattern: /\bresidual connection\b/i },
  { glossaryId: 'residual-stream', pattern: /\bresidual stream\b/i },
  { glossaryId: 'attention-score', pattern: /\battention scores\b/i },
  { glossaryId: 'attention-head', pattern: /\battention heads?\b/i },
  { glossaryId: 'causal-masking', pattern: /\bcausal masking\b/i },
  { glossaryId: 'model-architecture', pattern: /\bmodel architecture\b/i },
  { glossaryId: 'output-projection', pattern: /\boutput projection\b/i },
  { glossaryId: 'position-table', pattern: /\bposition table\b/i },
  { glossaryId: 'read-weight', pattern: /\bread weights?\b/i },
  { glossaryId: 'seeded-sampler', pattern: /\bseeded sampler\b/i },
  { glossaryId: 'token-table', pattern: /\btoken table\b/i },
  { glossaryId: 'weight-table', pattern: /\bweight tables?\b/i },
  { glossaryId: 'working-state', pattern: /\bworking state\b/i },
  { glossaryId: 'hidden-layer', pattern: /\bhidden layer\b/i },
  { glossaryId: 'stop-marker', pattern: /\bstop (?:signal|marker)\b/i },
  { glossaryId: 'token-id', pattern: /\btoken ids?\b/i },
  { glossaryId: 'learned-row', pattern: /\blearned rows?\b/i },
  { glossaryId: 'model-width', pattern: /\bmodel width\b/i },
  { glossaryId: 'temperature', pattern: /\btemperature\b/i },
  { glossaryId: 'inference', pattern: /\binference\b/i },
  { glossaryId: 'llm', pattern: /\bLLMs?\b/ },
  { glossaryId: 'llm', pattern: /\blanguage models?\b/i },
  { glossaryId: 'llm', pattern: /\blarge language models?\b/i },
  { glossaryId: 'attention', pattern: /\battention\b/i },
  { glossaryId: 'context', pattern: /\bcontext\b/i },
  { glossaryId: 'logit', pattern: /\blogits?\b/i },
  { glossaryId: 'mlp', pattern: /\bMLP\b/ },
  { glossaryId: 'normalization', pattern: /\bnormalization\b/i },
  { glossaryId: 'prefix', pattern: /\bprefix\b/i },
  { glossaryId: 'query', pattern: /\bqueries\b/i },
  { glossaryId: 'query', pattern: /\bquery\b/i },
  { glossaryId: 'sampling', pattern: /\bsampling\b/i },
  { glossaryId: 'slot', pattern: /\bslots?\b/i },
  { glossaryId: 'softmax', pattern: /\bsoftmax\b/i },
  { glossaryId: 'token', pattern: /\btokens?\b/i },
  { glossaryId: 'training', pattern: /\btraining\b/i },
  { glossaryId: 'value', pattern: /\bvalues?\b/i },
  { glossaryId: 'vector', pattern: /\bvectors?\b/i },
  { glossaryId: 'vocabulary', pattern: /\bvocabulary\b/i },
  { glossaryId: 'bos', pattern: /\bBOS\b/ },
  { glossaryId: 'key', pattern: /\bkeys\b/i },
  { glossaryId: 'key', pattern: /\bkey\b/i },
  { glossaryId: 'relu', pattern: /\bReLU\b/ },
  { glossaryId: 'rmsnorm', pattern: /\bRMSNorm\b/ },
  { glossaryId: 'wpe', pattern: /\bWPE\b/ },
  { glossaryId: 'wte', pattern: /\bWTE\b/ },
]

export function autoAnnotateText(value: string): AutoGlossarySegment[] {
  const segments: AutoGlossarySegment[] = []
  let rest = value

  while (rest.length > 0) {
    let firstMatch:
      | {
          index: number
          text: string
          glossaryId: GlossaryId
        }
      | undefined

    for (const term of autoTerms) {
      const match = term.pattern.exec(rest)
      if (!match?.[0]) {
        continue
      }

      if (
        !firstMatch ||
        match.index < firstMatch.index ||
        (match.index === firstMatch.index && match[0].length > firstMatch.text.length)
      ) {
        firstMatch = {
          index: match.index,
          text: match[0],
          glossaryId: term.glossaryId,
        }
      }
    }

    if (!firstMatch) {
      segments.push({ kind: 'text', text: rest })
      break
    }

    if (firstMatch.index > 0) {
      segments.push({ kind: 'text', text: rest.slice(0, firstMatch.index) })
    }

    segments.push({
      kind: 'term',
      text: firstMatch.text,
      glossaryId: firstMatch.glossaryId,
    })
    rest = rest.slice(firstMatch.index + firstMatch.text.length)
  }

  return segments
}
