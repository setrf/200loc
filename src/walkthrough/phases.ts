import type { TokenStepTrace } from '../model'
import { autoAnnotateText, type AutoGlossarySegment } from './autoGlossary'
import type { GlossaryId } from './glossary'
import {
  applySemanticHighlights,
  type SemanticHighlightSegment,
} from './semanticHighlights'
import type {
  CameraPoseId,
  VizEdgeId,
  VizNodeId,
  VizOverlayKind,
} from '../viz/llmViz/types'

export interface LineRange {
  start: number
  end: number
}

export interface PhaseVizConfig {
  focusNodeId: VizNodeId
  cameraPoseId: CameraPoseId
  overlayKind: VizOverlayKind
  emphasisNodeIds: VizNodeId[]
  emphasisEdgeIds: VizEdgeId[]
  focusWindowId: string
  tensorTargets: string[]
}

export type StorySegment =
  | {
      kind: 'text'
      text: string
    }
  | {
      kind: 'term'
      text: string
      glossaryId: GlossaryId
    }
  | SemanticHighlightSegment

export interface StoryBeat {
  kind: 'core' | 'term' | 'scene' | 'code'
  segments: StorySegment[]
}

export interface WalkthroughCopy {
  beats: StoryBeat[]
}

export interface SceneCopy {
  windowTitle: string
  windowSubtitle: string
  note?: string
}

export interface WalkthroughStepDefinition {
  id: string
  stepId: string
  title: string
  groupId: string
  groupTitle: string
  stepTitle: string
  stepIndexWithinGroup: number
  stepCountWithinGroup: number
  codeRanges: LineRange[]
  viz: PhaseVizConfig
  select: (trace: TokenStepTrace) => unknown
  copy: WalkthroughCopy
  sceneCopy: SceneCopy
}

export type PhaseDefinition = WalkthroughStepDefinition

export interface AppendixSection {
  id: string
  title: string
  description: string
  codeRanges: LineRange[]
}

export function getCodeExplainerText(phase: PhaseDefinition): string {
  const codeBeat = phase.copy.beats.find((beat) => beat.kind === 'code')
  if (!codeBeat) {
    return ''
  }
  return codeBeat.segments
    .map((segment) => segment.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

interface StepSeed {
  slug: string
  stepTitle: string
  copy: WalkthroughCopy
  sceneCopy?: Partial<SceneCopy>
}

interface GroupSeed {
  id: string
  groupTitle: string
  codeRanges: LineRange[]
  viz: PhaseVizConfig
  select: (trace: TokenStepTrace) => unknown
  sceneCopy: SceneCopy
  steps: StepSeed[]
}

type StorySegmentSeed =
  | string
  | {
      glossaryId: GlossaryId
      text: string
    }

function annotate(glossaryId: GlossaryId, text: string): StorySegmentSeed {
  return { glossaryId, text }
}

function toSegments(parts: StorySegmentSeed[]): StorySegment[] {
  const annotatedSegments = parts.flatMap((part): AutoGlossarySegment[] =>
    typeof part === 'string'
      ? autoAnnotateText(part)
      : [{ kind: 'term', text: part.text, glossaryId: part.glossaryId }],
  )
  return applySemanticHighlights(annotatedSegments)
}

function core(...parts: StorySegmentSeed[]): StoryBeat {
  return { kind: 'core', segments: toSegments(parts) }
}

function term(...parts: StorySegmentSeed[]): StoryBeat {
  return { kind: 'term', segments: toSegments(parts) }
}

function scene(...parts: StorySegmentSeed[]): StoryBeat {
  return { kind: 'scene', segments: toSegments(parts) }
}

function code(...parts: StorySegmentSeed[]): StoryBeat {
  return { kind: 'code', segments: toSegments(parts) }
}

function normalizeHighlightKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function dedupeDefinitionSegments(beats: StoryBeat[]): StoryBeat[] {
  const seenGlossaryIds = new Set<GlossaryId>()
  const seenHighlights = new Set<string>()

  return beats.map((beat) => ({
    ...beat,
    segments: beat.segments.map((segment): StorySegment => {
      if (segment.kind === 'term') {
        if (seenGlossaryIds.has(segment.glossaryId)) {
          return { kind: 'text', text: segment.text }
        }

        seenGlossaryIds.add(segment.glossaryId)
        return segment
      }

      if (segment.kind === 'highlight') {
        const highlightKey = normalizeHighlightKey(segment.text)
        if (seenHighlights.has(highlightKey)) {
          return { kind: 'text', text: segment.text }
        }

        seenHighlights.add(highlightKey)
        return segment
      }

      return segment
    }),
  }))
}

function lesson(beats: StoryBeat[]): WalkthroughCopy {
  return { beats: dedupeDefinitionSegments(beats) }
}

function defineGroup(group: GroupSeed): PhaseDefinition[] {
  return group.steps.map((step, index) => ({
    id: group.id,
    stepId: `${group.id}-${step.slug}`,
    title: step.stepTitle,
    groupId: group.id,
    groupTitle: group.groupTitle,
    stepTitle: step.stepTitle,
    stepIndexWithinGroup: index + 1,
    stepCountWithinGroup: group.steps.length,
    codeRanges: group.codeRanges,
    viz: group.viz,
    select: group.select,
    copy: step.copy,
    sceneCopy: {
      ...group.sceneCopy,
      ...step.sceneCopy,
    },
  }))
}

const inferenceGroups: GroupSeed[] = [
  {
    id: 'tokenize',
    groupTitle: 'Tokenize Prefix',
    codeRanges: [
      { start: 23, end: 27 },
      { start: 191, end: 196 },
    ],
    viz: {
      focusNodeId: 'context',
      cameraPoseId: 'overview',
      overlayKind: 'context-cache',
      emphasisNodeIds: ['context'],
      emphasisEdgeIds: [
        'context-to-token-embedding',
        'context-to-position-embedding',
      ],
      focusWindowId: 'context-window',
      tensorTargets: [],
    },
    select: (trace) => ({
      tokenId: trace.tokenId,
      positionId: trace.positionId,
    }),
    sceneCopy: {
      windowTitle: 'Readable history for this moment',
      windowSubtitle:
        'The model can read the current slot and every earlier visible slot.',
      note:
        'The highlighted strip is the only information this prediction step is allowed to use.',
    },
    steps: [
      {
        slug: 'readable-history',
        stepTitle: 'See the readable history',
        copy: lesson([
          core(
            'The model starts by checking the small piece of text it is allowed to use for this decision.',
          ),
          core(
            'That visible piece includes the current position and every earlier position, but nothing to the right because the next token has not been chosen yet.',
          ),
          term(
            annotate('context', 'Context'),
            ' means the text the model is allowed to read before it makes its next guess.',
          ),
          scene(
            'Look at the highlighted context strip. Every slot inside it is part of the ',
            annotate('visible-history', 'visible history'),
            ' available to the model right now.',
          ),
          code(
            'These lines build the visible ',
            annotate('prefix', 'prefix'),
            ' and set up the loop that predicts one new token at a time.',
          ),
        ]),
      },
      {
        slug: 'current-slot-goal',
        stepTitle: 'Focus on the slot being processed now',
        copy: lesson([
          core(
            'One position matters most right now: the exact place the model is using to decide what should come next.',
          ),
          core(
            'The model studies that current position together with the earlier visible text so it can guess the token for the next position.',
          ),
          term(
            'A ',
            annotate('slot', 'slot'),
            ' is one position in the running text, such as the current position or the next one being predicted.',
          ),
          scene(
            'Look for the slot marked as current. The transition label shows the current slot on the left and the next slot on the right.',
          ),
          code(
            'These lines keep track of the current position and move the outer generation loop forward one slot at a time.',
          ),
        ]),
      },
      {
        slug: 'token-ids',
        stepTitle: 'Turn characters into machine-readable ids',
        copy: lesson([
          core(
            'Before the model can do any math, the visible characters must be turned into small numeric labels.',
          ),
          core(
            'The model works with those numeric labels instead of raw letters, and later steps will turn them into richer numeric descriptions.',
          ),
          term(
            'A ',
            annotate('token-id', 'token id'),
            ' is the number the model uses to name one text unit inside its ',
            annotate('vocabulary', 'vocabulary'),
            '.',
          ),
          term(
            annotate('bos', 'BOS'),
            ' means beginning of sequence. In this tiny model, that same marker is also used as the signal to stop generation.',
          ),
          scene(
            'Look at the context labels. The model is about to use the hidden numeric ids behind those visible symbols.',
          ),
          code(
            'These lines convert text into token ids, predict another id, and repeat the loop.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'token-embedding',
    groupTitle: 'Token Embedding',
    codeRanges: [{ start: 109, end: 109 }],
    viz: {
      focusNodeId: 'token-embedding',
      cameraPoseId: 'input',
      overlayKind: 'embedding-lookup',
      emphasisNodeIds: ['context', 'token-embedding'],
      emphasisEdgeIds: [
        'context-to-token-embedding',
        'token-embedding-to-residual-stream',
      ],
      focusWindowId: 'wte-window',
      tensorTargets: ['wte'],
    },
    select: (trace) => trace.tokenEmbedding,
    sceneCopy: {
      windowTitle: 'Meaning lookup for the current token',
      windowSubtitle: 'The current token id selects one learned row from the token table.',
      note: 'That learned row is the first numeric description of what the current token tends to mean in many contexts.',
    },
    steps: [
      {
        slug: 'meaning-lookup',
        stepTitle: 'Look up a learned meaning vector',
        copy: lesson([
          core(
            'The token id now points into a learned table that stores what different tokens tend to mean.',
          ),
          core(
            'The model pulls out one row from that table, creating a 16-number ',
            annotate('vector', 'vector'),
            ' it can actually compare and transform.',
          ),
          scene(
            'Look at the highlighted row in the lower table and the ',
            annotate('vector', 'vector'),
            ' beneath it. That pulled-out row is the token description for this step.',
          ),
          code(
            'This highlighted line uses the current token id to fetch one ',
            annotate('learned-row', 'learned row'),
            ' from the ',
            annotate('token-table', 'token table'),
            '.',
          ),
        ]),
      },
      {
        slug: 'embedding-term',
        stepTitle: 'Name this learned lookup a token embedding',
        copy: lesson([
          core(
            'That learned token description has a standard name used throughout language-model work.',
          ),
          core(
            'From here on, the model treats this row as the starting numeric description of the current token.',
          ),
          term(
            'A ',
            annotate('token-embedding', 'token embedding'),
            ' is the learned ',
            annotate('vector', 'vector'),
            ' pulled from the ',
            annotate('token-table', 'token table'),
            ' for one token id.',
          ),
          term(
            annotate('wte', 'WTE'),
            ' is the name of the ',
            annotate('token-table', 'token table'),
            ' that stores one embedding row for each token in the ',
            annotate('vocabulary', 'vocabulary'),
            '.',
          ),
          scene(
            'Look at the table as shared memory and the extracted row as the one token embedding for the current slot.',
          ),
          code(
            'This same lookup line indexes the WTE table and returns the current token embedding.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'Meaning lookup (token embedding / WTE)',
        },
      },
    ],
  },
  {
    id: 'position-embedding',
    groupTitle: 'Position Embedding',
    codeRanges: [{ start: 110, end: 110 }],
    viz: {
      focusNodeId: 'position-embedding',
      cameraPoseId: 'input',
      overlayKind: 'embedding-lookup',
      emphasisNodeIds: ['context', 'position-embedding'],
      emphasisEdgeIds: [
        'context-to-position-embedding',
        'position-embedding-to-residual-stream',
      ],
      focusWindowId: 'wpe-window',
      tensorTargets: ['wpe'],
    },
    select: (trace) => trace.positionEmbedding,
    sceneCopy: {
      windowTitle: 'Position signal for the current slot',
      windowSubtitle:
        'The model looks up a second row that says where this slot sits in the sequence.',
      note:
        'The same token should be allowed to mean different things at different positions.',
    },
    steps: [
      {
        slug: 'why-order-matters',
        stepTitle: 'Add information about where the token sits',
        copy: lesson([
          core(
            'The model also needs to know where this token sits in the sequence, not just which token it is.',
          ),
          core(
            'So it looks up a second ',
            annotate('learned-row', 'learned row'),
            ' using the current position, giving this slot an order signal.',
          ),
          scene(
            'Look at the highlighted row in the second table. It is chosen by position, not by token identity.',
          ),
          code(
            'This line uses the slot index to fetch the learned position row for the current step.',
          ),
        ]),
      },
      {
        slug: 'position-term',
        stepTitle: 'Name this lookup a position embedding',
        copy: lesson([
          core(
            'This position row also has a standard name, because models use it at every step.',
          ),
          core(
            'The model keeps the token meaning and the slot position as separate learned signals until the next step combines them.',
          ),
          term(
            'A ',
            annotate('position-embedding', 'position embedding'),
            ' is the learned ',
            annotate('vector', 'vector'),
            ' that marks where one slot sits in the sequence.',
          ),
          term(
            annotate('wpe', 'WPE'),
            ' is the ',
            annotate('position-table', 'position table'),
            ' that stores one ',
            annotate('learned-row', 'learned row'),
            ' for each possible slot position.',
          ),
          scene(
            'Look at the extracted ',
            annotate('vector', 'vector'),
            ' in the lower window. That is the position signal that will be added next.',
          ),
          code(
            'This same lookup line reads from the WPE table and produces the current position embedding.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'Position signal (position embedding / WPE)',
        },
      },
    ],
  },
  {
    id: 'embed-add-norm',
    groupTitle: 'Add + RMSNorm',
    codeRanges: [{ start: 111, end: 112 }],
    viz: {
      focusNodeId: 'norm-1',
      cameraPoseId: 'input',
      overlayKind: 'residual-update',
      emphasisNodeIds: ['residual-stream', 'norm-1'],
      emphasisEdgeIds: [
        'token-embedding-to-residual-stream',
        'position-embedding-to-residual-stream',
        'residual-stream-to-norm-1',
      ],
      focusWindowId: 'norm-window',
      tensorTargets: [],
    },
    select: (trace) => trace.xAfterNorm,
    sceneCopy: {
      windowTitle: 'Build the running state for this slot',
      windowSubtitle:
        'The model adds token meaning and position, then rescales the result before attention reads it.',
      note: 'This combined vector is the first full working state for the current slot.',
    },
    steps: [
      {
        slug: 'combine-signals',
        stepTitle: 'Combine what the token is with where it is',
        copy: lesson([
          core(
            'The model now combines the token meaning signal and the position signal into one shared ',
            annotate('working-state', 'working state'),
            '.',
          ),
          core(
            'It adds the two ',
            annotate('vector', 'vectors'),
            ' number by number so later steps can reason about this slot as one object.',
          ),
          term(
            'The ',
            annotate('residual-stream', 'residual stream'),
            ' is the main running state that carries information through the model and gets updated along the way.',
          ),
          scene(
            'Look at the first two vectors as ingredients and the summed vector as the new ',
            annotate('working-state', 'working state'),
            ' for this slot.',
          ),
          code(
            'The first highlighted line adds the token vector and the position vector into the slot state used by later layers.',
          ),
        ]),
      },
      {
        slug: 'normalize-scale',
        stepTitle: 'Rescale the running state before attention reads it',
        copy: lesson([
          core(
            'Before the model reads from this ',
            annotate('working-state', 'working state'),
            ', it adjusts the overall size of the numbers so the next math stays stable.',
          ),
          core(
            'This keeps later layers reacting to the pattern in the state, not to whether the numbers happen to be unusually large or small.',
          ),
          term(
            annotate('rmsnorm', 'RMSNorm'),
            ' is a ',
            annotate('normalization', 'normalization'),
            ' step that keeps a ',
            annotate('vector', 'vector'),
            ' numerically well-behaved without changing its overall direction too much.',
          ),
          scene(
            'Look at the final vector in the lower window. It is the rescaled version of the slot state that attention will read next.',
          ),
          code(
            'The second highlighted line applies RMSNorm to the residual stream before attention uses it.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'Build and rescale the running state (residual stream / RMSNorm)',
        },
      },
    ],
  },
  {
    id: 'qkv',
    groupTitle: 'Q / K / V',
    codeRanges: [{ start: 117, end: 122 }],
    viz: {
      focusNodeId: 'qkv',
      cameraPoseId: 'attention',
      overlayKind: 'projection',
      emphasisNodeIds: [
        'qkv',
        'attention-head-1',
        'attention-head-2',
        'attention-head-3',
        'attention-head-4',
      ],
      emphasisEdgeIds: [
        'norm-1-to-qkv',
        'qkv-to-attention-head-1',
        'qkv-to-attention-head-2',
        'qkv-to-attention-head-3',
        'qkv-to-attention-head-4',
      ],
      focusWindowId: 'qkv-window',
      tensorTargets: [
        'layer0.attn_wq',
        'layer0.attn_wk',
        'layer0.attn_wv',
      ],
    },
    select: (trace) => trace.heads,
    sceneCopy: {
      windowTitle: 'Set up the read operation',
      windowSubtitle:
        'The normalized slot state is projected into three different views of the same slot.',
      note:
        'Each view serves a different role in deciding where to look and what to bring back.',
    },
    steps: [
      {
        slug: 'attention-as-read',
        stepTitle: 'Treat attention as a read from earlier slots',
        copy: lesson([
          core(
            'Attention is easiest to understand as a smart read from earlier visible slots.',
          ),
          core(
            'The model turns the current slot into helper ',
            annotate('vector', 'vectors'),
            ' that let it search the ',
            annotate('visible-history', 'visible history'),
            ', compare possible matches, and pull back useful information.',
          ),
          term(
            annotate('attention', 'Attention'),
            ' is the part of the model that decides which visible slots matter and how strongly to read from them.',
          ),
          scene(
            'Look at the three tables and three output strips in the lower window. They are three different learned views of the same slot state.',
          ),
          code(
            'These highlighted lines apply three learned ',
            annotate('weight-table', 'weight tables'),
            ' to prepare the attention read.',
          ),
        ]),
      },
      {
        slug: 'query',
        stepTitle: 'Build a search request for what matters now',
        copy: lesson([
          core(
            'One helper vector acts like a search request for the kind of earlier information that would help right now.',
          ),
          core(
            'Each attention head gets its own version of that request, so different heads can look for different patterns.',
          ),
          term(
            'A ',
            annotate('query', 'query'),
            ' is the search request ',
            annotate('vector', 'vector'),
            ' the current slot uses to ask what it should retrieve.',
          ),
          scene(
            'Look at the output labeled as the search request. That is what will be compared against the ',
            annotate('visible-history', 'visible history'),
            '.',
          ),
          code(
            'Part of this projection block multiplies the slot state by the query ',
            annotate('weight-table', 'weight table'),
            ' to create the query vectors.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'What this slot is looking for (query)',
        },
      },
      {
        slug: 'key',
        stepTitle: 'Build a description each visible slot can be matched against',
        copy: lesson([
          core(
            'A second helper vector acts like a description card that says what each visible slot has to offer.',
          ),
          core(
            'The model will compare the current search request against these descriptions to decide which earlier slots are relevant.',
          ),
          term(
            'A ',
            annotate('key', 'key'),
            ' is the description ',
            annotate('vector', 'vector'),
            ' a slot exposes so the model can test whether it matches the current query.',
          ),
          scene(
            'Look at the key output strip. Those are the slot descriptions that the query will be compared against.',
          ),
          code(
            'This same projection block applies a second ',
            annotate('weight-table', 'weight table'),
            ' to create the key vectors.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'How each visible slot describes itself (key)',
        },
      },
      {
        slug: 'value',
        stepTitle: 'Build the information each visible slot is able to return',
        copy: lesson([
          core(
            'A third helper vector holds the actual information that can be brought back if a slot turns out to matter.',
          ),
          core(
            'After the model decides where to look, it will blend these returnable vectors and send the result back to the current slot.',
          ),
          term(
            'A ',
            annotate('value', 'value'),
            ' is the information ',
            annotate('vector', 'vector'),
            ' a slot contributes when attention reads from it.',
          ),
          scene(
            'Look at the value output strip. Those are the pieces of information the model may mix together next.',
          ),
          code(
            'The third projection in the highlighted code creates the value vectors that attention will later blend.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'What each visible slot can return (value)',
        },
      },
    ],
  },
  {
    id: 'attention-scores',
    groupTitle: 'Attention Scores',
    codeRanges: [{ start: 124, end: 129 }],
    viz: {
      focusNodeId: 'attention-head-2',
      cameraPoseId: 'attention',
      overlayKind: 'attention-scores',
      emphasisNodeIds: [
        'attention-head-1',
        'attention-head-2',
        'attention-head-3',
        'attention-head-4',
      ],
      emphasisEdgeIds: [
        'qkv-to-attention-head-1',
        'qkv-to-attention-head-2',
        'qkv-to-attention-head-3',
        'qkv-to-attention-head-4',
      ],
      focusWindowId: 'attention-scores-window',
      tensorTargets: [],
    },
    select: (trace) => trace.heads.map((head) => head.scores),
    sceneCopy: {
      windowTitle: 'Compare the current request against visible slots',
      windowSubtitle:
        'Each head produces raw match scores between the current query and visible keys.',
      note:
        'These numbers are not probabilities yet. They are just raw evidence of how well each visible slot matches the current request.',
    },
    steps: [
      {
        slug: 'raw-comparison',
        stepTitle: 'Compute raw match scores',
        copy: lesson([
          core(
            'The current search request is now compared against the slot descriptions from the ',
            annotate('visible-history', 'visible history'),
            '.',
          ),
          core(
            'Each attention head produces one raw match number for each visible slot, giving the model a first guess about what looks relevant.',
          ),
          term(
            'An ',
            annotate('attention-score', 'attention score'),
            ' is the raw match number produced when a query is compared with a key.',
          ),
          scene(
            'Look at each row in the lower window. It shows one head’s raw match strengths across the visible slots.',
          ),
          code(
            'These highlighted lines compare queries against keys and produce the raw attention scores.',
          ),
        ]),
      },
      {
        slug: 'causal-visibility',
        stepTitle: 'Allow reading only from the current slot and earlier ones',
        copy: lesson([
          core(
            'The model is not allowed to look into the future while it is still deciding the next token.',
          ),
          core(
            'Only the current slot and earlier visible slots get real scores. Future slots are blocked so they cannot leak answers backward.',
          ),
          term(
            annotate('causal-masking', 'Causal masking'),
            ' is the rule that hides future positions so each prediction uses only the current position and the history behind it.',
          ),
          scene(
            'Look at the visible score columns only. Slots outside the readable band are intentionally blocked from the read.',
          ),
          code(
            'These same attention-score lines include the rule that blocks future positions from influencing the current prediction.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'attention-softmax',
    groupTitle: 'Attention Weights',
    codeRanges: [
      { start: 97, end: 101 },
      { start: 130, end: 130 },
    ],
    viz: {
      focusNodeId: 'attention-head-2',
      cameraPoseId: 'attention',
      overlayKind: 'attention-weights',
      emphasisNodeIds: [
        'attention-head-1',
        'attention-head-2',
        'attention-head-3',
        'attention-head-4',
      ],
      emphasisEdgeIds: [
        'qkv-to-attention-head-1',
        'qkv-to-attention-head-2',
        'qkv-to-attention-head-3',
        'qkv-to-attention-head-4',
      ],
      focusWindowId: 'attention-weights-window',
      tensorTargets: [],
    },
    select: (trace) => trace.heads.map((head) => head.weights),
    sceneCopy: {
      windowTitle: 'Turn raw scores into read weights',
      windowSubtitle:
        'Each head converts its raw match scores into a normalized distribution over visible slots.',
      note:
        'The weights say how much attention each visible slot will receive during the read.',
    },
    steps: [
      {
        slug: 'softmax-normalization',
        stepTitle: 'Convert raw scores into normalized weights',
        copy: lesson([
          core(
            'The raw match numbers are now turned into cleaner ',
            annotate('read-weight', 'read weights'),
            '.',
          ),
          core(
            'A rescaling step makes the weights positive and forces them to add up to one, so the model can divide its attention in a controlled way.',
          ),
          term(
            annotate('softmax', 'Softmax'),
            ' is the function that turns a list of scores into positive weights that add up to one.',
          ),
          scene(
            'Look at the weight view. Taller bars or stronger cells mean that head plans to read more from that visible slot.',
          ),
          code(
            'The highlighted normalization lines apply softmax to the raw attention scores and produce the ',
            annotate('read-weight', 'read weights'),
            '.',
          ),
        ]),
      },
      {
        slug: 'weights-meaning',
        stepTitle: 'Read the weights as a probability-like focus pattern',
        copy: lesson([
          core(
            'After normalization, each row can be read as a ',
            annotate('focus-pattern', 'focus pattern'),
            ' over the visible slots.',
          ),
          core(
            'Different rows may concentrate on different parts of the history, which is why the model can gather several kinds of evidence at once.',
          ),
          term(
            'An ',
            annotate('attention-head', 'attention head'),
            ' is one independent read channel with its own query, key, value, and ',
            annotate('focus-pattern', 'focus pattern'),
            '.',
          ),
          scene(
            'Compare the rows across heads. Different heads can place their focus on different visible positions at the same time.',
          ),
          code(
            'These same softmax-related lines produce one normalized read ',
            annotate('probability-distribution', 'distribution'),
            ' for each attention head.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'weighted-values',
    groupTitle: 'Weighted Values',
    codeRanges: [{ start: 131, end: 132 }],
    viz: {
      focusNodeId: 'attention-mix',
      cameraPoseId: 'attention',
      overlayKind: 'attention-mix',
      emphasisNodeIds: [
        'attention-head-1',
        'attention-head-2',
        'attention-head-3',
        'attention-head-4',
        'attention-mix',
      ],
      emphasisEdgeIds: [
        'attention-head-1-to-attention-mix',
        'attention-head-2-to-attention-mix',
        'attention-head-3-to-attention-mix',
        'attention-head-4-to-attention-mix',
      ],
      focusWindowId: 'attention-mix-window',
      tensorTargets: [],
    },
    select: (trace) => trace.heads.map((head) => head.mixedValue),
    sceneCopy: {
      windowTitle: 'Blend returned information from visible slots',
      windowSubtitle: 'Each head uses its read weights to mix value vectors into one returned result.',
      note:
        'This is the actual information transfer step of attention.',
    },
    steps: [
      {
        slug: 'blend-values',
        stepTitle: 'Blend returned information using the read weights',
        copy: lesson([
          core(
            'The model now uses the ',
            annotate('read-weight', 'read weights'),
            ' to mix together the value vectors from the visible slots.',
          ),
          core(
            'Each head gives more influence to slots with larger weights and less influence to slots with smaller weights, producing one returned vector.',
          ),
          scene(
            'Look at each head’s panel. The table shows candidate value vectors, and the result strip shows the single mixed vector that comes back.',
          ),
          code(
            'These highlighted lines multiply value vectors by their ',
            annotate('read-weight', 'weights'),
            ' and sum the results for each head.',
          ),
        ]),
      },
      {
        slug: 'heads-differ',
        stepTitle: 'Let different heads return different kinds of information',
        copy: lesson([
          core(
            'The heads do not have to read the same thing, and that variety is part of what makes attention useful.',
          ),
          core(
            'Because each head has its own learned weights, one head can focus on one pattern while another head focuses somewhere else.',
          ),
          scene(
            'Compare the mixed result strips across heads. They differ because each head read the visible history in its own way.',
          ),
          code(
            'These same weighted-value lines run once per head, so the model gets several returned vectors in parallel.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'attn-out',
    groupTitle: 'Output Projection + Residual',
    codeRanges: [{ start: 133, end: 134 }],
    viz: {
      focusNodeId: 'residual-add-1',
      cameraPoseId: 'residual',
      overlayKind: 'residual-update',
      emphasisNodeIds: ['attention-mix', 'residual-add-1'],
      emphasisEdgeIds: ['attention-mix-to-residual-add-1'],
      focusWindowId: 'attn-out-window',
      tensorTargets: ['layer0.attn_wo'],
    },
    select: (trace) => ({
      attnOutput: trace.attnOutput,
      residual: trace.xAfterAttnResidual,
    }),
    sceneCopy: {
      windowTitle: 'Combine the head results and write them back',
      windowSubtitle:
        'The head outputs are joined, projected back to model width, and added onto the running slot state.',
      note:
        'Attention produces a correction to the slot state, not a complete replacement of it.',
    },
    steps: [
      {
        slug: 'combine-heads',
        stepTitle: 'Join the four head results into one wider vector',
        copy: lesson([
          core(
            'The separate head outputs are first stitched together into one larger read result.',
          ),
          core(
            'This lets the model keep the information from all heads while preparing it for the next learned transform.',
          ),
          scene(
            'Look at the first vector in the lower window. It shows the head outputs joined end to end.',
          ),
          code(
            'The first part of this highlighted range combines the per-head outputs into one wider attention result.',
          ),
        ]),
      },
      {
        slug: 'project-back',
        stepTitle: 'Project the combined read back to the model’s main width',
        copy: lesson([
          core(
            'The joined head result is too wide to fit back into the model’s normal working state, so it is compressed back down.',
          ),
          core(
            'A learned map turns the wide attention result into a ',
            annotate('model-width', 'model-width'),
            ' ',
            annotate('vector', 'vector'),
            ' that can rejoin the main flow.',
          ),
          term(
            'The ',
            annotate('output-projection', 'output projection'),
            ' is the learned map that converts the joined head results back into one ',
            annotate('model-width', 'model-width'),
            ' ',
            annotate('vector', 'vector'),
            '.',
          ),
          scene(
            'Look at the ',
            annotate('weight-table', 'weight table'),
            ' and the second vector in the lower window. They show the attention result after it has been projected back down.',
          ),
          code(
            'This same highlighted range applies the attention output ',
            annotate('weight-table', 'weights'),
            ' to the combined head vector.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'Project the combined read back to the model width',
        },
      },
      {
        slug: 'add-back',
        stepTitle: 'Add the read result back onto the running slot state',
        copy: lesson([
          core(
            'The attention result is added onto the running slot state instead of replacing it.',
          ),
          core(
            'That way, the model keeps the earlier state and layers new information from the ',
            annotate('visible-history', 'visible history'),
            ' on top of it.',
          ),
          term(
            'A ',
            annotate('residual-connection', 'residual connection'),
            ' adds a block’s output back onto the running state instead of discarding the earlier state.',
          ),
          scene(
            'Look at the last vector in the lower window. It is the updated slot state after the attention result has been added back in.',
          ),
          code(
            'The second line in this highlighted range performs the residual add that writes attention’s contribution back into the slot state.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'mlp',
    groupTitle: 'MLP Block',
    codeRanges: [{ start: 136, end: 141 }],
    viz: {
      focusNodeId: 'mlp',
      cameraPoseId: 'residual',
      overlayKind: 'mlp',
      emphasisNodeIds: ['norm-2', 'mlp'],
      emphasisEdgeIds: ['residual-add-1-to-norm-2', 'norm-2-to-mlp'],
      focusWindowId: 'mlp-window',
      tensorTargets: ['layer0.mlp_fc1', 'layer0.mlp_fc2'],
    },
    select: (trace) => ({
      hidden: trace.mlpHidden,
      output: trace.mlpOutput,
      residual: trace.xAfterMlpResidual,
    }),
    sceneCopy: {
      windowTitle: 'Do local computation inside this one slot',
      windowSubtitle:
        'After attention, the slot goes through a two-layer feed-forward block with a nonlinearity in the middle.',
      note:
        'Attention moves information between positions. This block transforms the current slot locally.',
    },
    steps: [
      {
        slug: 'local-computation',
        stepTitle: 'Do local computation after the attention read',
        copy: lesson([
          core(
            'After attention has gathered information from other slots, the model now works on this slot by itself.',
          ),
          core(
            'The slot enters a small feed-forward block that transforms the gathered information locally, without reading other positions.',
          ),
          term(
            annotate('mlp', 'MLP'),
            ' stands for multilayer perceptron. Here it means the small two-layer block that processes one slot on its own.',
          ),
          scene(
            'Look at the lower window now. It follows one slot through a local transformation pipeline instead of a cross-slot read.',
          ),
          code(
            'These highlighted lines normalize the post-attention state and send it into the two-layer MLP block.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'Local computation after attention (MLP block)',
        },
      },
      {
        slug: 'expand-hidden',
        stepTitle: 'Expand the slot into a larger hidden space',
        copy: lesson([
          core(
            'The first part of the MLP gives the slot more room to build an intermediate pattern.',
          ),
          core(
            'It expands the 16-number slot state into a larger temporary workspace so the model can form richer combinations before shrinking back down.',
          ),
          term(
            'A ',
            annotate('hidden-layer', 'hidden layer'),
            ' is a temporary internal representation used during computation before the block produces its final output.',
          ),
          scene(
            'Look at the first ',
            annotate('weight-table', 'weight table'),
            ' and the larger vector strip. They show the slot being expanded into a bigger workspace.',
          ),
          code(
            'The early lines in this MLP range apply the first feed-forward ',
            annotate('weight-table', 'weight table'),
            ' and create the hidden vector.',
          ),
        ]),
      },
      {
        slug: 'relu',
        stepTitle: 'Keep only the positive hidden activations',
        copy: lesson([
          core(
            'The model now applies a simple gate that keeps positive values and drops negative ones to zero.',
          ),
          core(
            'This non-linear step helps the block do more than a single plain linear remapping.',
          ),
          term(
            annotate('relu', 'ReLU'),
            ' is a gate that turns negative values into zero and leaves positive values unchanged.',
          ),
          scene(
            'Look at the hidden vector strip. Zeros and surviving positive values show the effect of the ReLU gate.',
          ),
          code(
            'The middle part of the highlighted MLP code applies ReLU to the expanded hidden vector.',
          ),
        ]),
      },
      {
        slug: 'project-down',
        stepTitle: 'Project back down and add another residual update',
        copy: lesson([
          core(
            'The hidden result is now compressed back to the model’s normal ',
            annotate('model-width', 'width'),
            ' and written onto the running slot state.',
          ),
          core(
            'This returns the local computation to the shared slot format while preserving the earlier state underneath it.',
          ),
          scene(
            'Look at the final two vectors. They show the projected MLP result and then the updated running state after the add.',
          ),
          code(
            'The later MLP lines apply the second projection and then add the result back onto the slot state.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'lm-head',
    groupTitle: 'LM Head Logits',
    codeRanges: [{ start: 143, end: 143 }],
    viz: {
      focusNodeId: 'logits',
      cameraPoseId: 'readout',
      overlayKind: 'logits',
      emphasisNodeIds: ['mlp', 'logits'],
      emphasisEdgeIds: ['mlp-to-logits'],
      focusWindowId: 'lm-head-window',
      tensorTargets: ['lm_head'],
    },
    select: (trace) => trace.logits,
    sceneCopy: {
      windowTitle: 'Score every possible next token',
      windowSubtitle:
        'The final slot state is compared against every vocabulary option and turned into one raw score per token.',
      note:
        'The model still has not chosen a token. It has only scored the options.',
    },
    steps: [
      {
        slug: 'score-vocab',
        stepTitle: 'Turn the final slot state into one score per vocabulary item',
        copy: lesson([
          core(
            'The model now compares the finished slot state against every possible next token it knows about.',
          ),
          core(
            'It produces one raw score per ',
            annotate('vocabulary', 'vocabulary'),
            ' item, showing how strongly the current state supports each possible continuation.',
          ),
          scene(
            'Look at the output table, the incoming slot state, and the score ',
            annotate('vector', 'vector'),
            ' below it. That vector is the model’s raw preference list over the ',
            annotate('vocabulary', 'vocabulary'),
            '.',
          ),
          code(
            'This highlighted line projects the final slot state through the output weights and produces one raw score per vocabulary item.',
          ),
        ]),
      },
      {
        slug: 'lm-head-logits',
        stepTitle: 'Name the scoring layer and its raw outputs',
        copy: lesson([
          core(
            'This final scoring step and its outputs have standard names that show up in most model discussions.',
          ),
          core(
            'The model still has only raw preferences at this point, not probabilities or a chosen token.',
          ),
          term(
            'The ',
            annotate('lm-head', 'LM head'),
            ' is the final learned layer that turns the slot state into one score per vocabulary token.',
          ),
          term(
            'A ',
            annotate('logit', 'logit'),
            ' is one raw score for one possible next token before probabilities are computed.',
          ),
          scene(
            'Read the score vector as raw preferences, not percentages. Bigger values mean stronger preference before normalization.',
          ),
          code(
            'This same output-projection line runs the LM head and produces the logits.',
          ),
        ]),
        sceneCopy: {
          windowTitle: 'Vocabulary scoring layer (LM head) and raw scores (logits)',
        },
      },
    ],
  },
  {
    id: 'probabilities',
    groupTitle: 'Softmax Probabilities',
    codeRanges: [
      { start: 97, end: 101 },
      { start: 195, end: 195 },
    ],
    viz: {
      focusNodeId: 'probabilities',
      cameraPoseId: 'readout',
      overlayKind: 'logits',
      emphasisNodeIds: ['logits', 'probabilities'],
      emphasisEdgeIds: ['logits-to-probabilities'],
      focusWindowId: 'probabilities-window',
      tensorTargets: ['lm_head'],
    },
    select: (trace) => trace.topCandidates,
    sceneCopy: {
      windowTitle: 'Convert raw scores into next-token probabilities',
      windowSubtitle:
        'The model rescales the logits and turns them into a normalized distribution over the vocabulary.',
      note:
        "This makes the model's preferences readable as probabilities while keeping every candidate in the same competition.",
    },
    steps: [
      {
        slug: 'convert-to-probabilities',
        stepTitle: 'Convert raw scores into probabilities',
        copy: lesson([
          core(
            'The raw scores are now turned into probabilities over all possible next tokens.',
          ),
          core(
            'This puts every candidate on one shared scale, making the model’s preference ',
            annotate('probability-distribution', 'distribution'),
            ' easier to inspect and sample from.',
          ),
          term(
            annotate('temperature', 'Temperature'),
            ' is the knob that makes the ',
            annotate('probability-distribution', 'distribution'),
            ' sharper or flatter before the final probabilities are computed.',
          ),
          scene(
            'Look at the bars or cells in the probability view. The largest ones mark the strongest next-token candidates.',
          ),
          code(
            'This highlighted line rescales the logits and applies softmax to produce vocabulary probabilities.',
          ),
        ]),
      },
      {
        slug: 'probability-not-certainty',
        stepTitle: 'Read high probability as preference, not certainty',
        copy: lesson([
          core(
            'A high probability means the model prefers an option, but it does not mean the answer is guaranteed.',
          ),
          core(
            'Several candidates can still carry meaningful probability mass, especially when the model is uncertain.',
          ),
          scene(
            'Compare the tallest bar with the rest of the distribution. A large gap means the model is more decisive; a smaller gap means it is less sure.',
          ),
          code(
            'This same ',
            annotate('normalization', 'normalization'),
            ' step produces the full ',
            annotate('probability-distribution', 'distribution'),
            ' over the ',
            annotate('vocabulary', 'vocabulary'),
            ', not just the top candidate.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'sample',
    groupTitle: 'Sample Token',
    codeRanges: [{ start: 196, end: 196 }],
    viz: {
      focusNodeId: 'sample',
      cameraPoseId: 'sample',
      overlayKind: 'sample',
      emphasisNodeIds: ['probabilities', 'sample'],
      emphasisEdgeIds: ['probabilities-to-sample'],
      focusWindowId: 'sample-window',
      tensorTargets: [],
    },
    select: (trace) => trace.sampledTokenId,
    sceneCopy: {
      windowTitle: 'Choose one concrete next token',
      windowSubtitle: "The probability distribution is turned into one actual token choice that can be fed back into the loop.",
      note: 'A distribution is a set of possibilities. Sampling collapses it into one concrete continuation.',
    },
    steps: [
      {
        slug: 'pick-token',
        stepTitle: 'Pick one concrete next token from the distribution',
        copy: lesson([
          core(
            'The model now stops listing possibilities and chooses one actual next token.',
          ),
          core(
            'Generation cannot continue from probabilities alone. The loop needs one concrete token to append and feed back in.',
          ),
          term(
            annotate('sampling', 'Sampling'),
            ' means choosing one token according to the model’s predicted ',
            annotate('probability-distribution', 'probability distribution'),
            '.',
          ),
          scene(
            'Look at the highlighted token in the lower window. It is the one chosen from the full probability distribution.',
          ),
          code(
            'This highlighted line takes the probability distribution and turns it into one sampled token id.',
          ),
        ]),
      },
      {
        slug: 'seeded-determinism',
        stepTitle: 'Use a seeded sampler so the demo stays repeatable',
        copy: lesson([
          core(
            'This demo keeps the random process repeatable so the same prefix leads to the same shown result.',
          ),
          core(
            'That makes the walkthrough teachable, because you can step through the same example again and see the same explanations line up with the same outputs.',
          ),
          term(
            'A ',
            annotate('seeded-sampler', 'seeded sampler'),
            ' starts from a fixed random state so repeated runs can produce the same sequence of sampled choices.',
          ),
          scene(
            'Look at the chosen token as a real sample from probabilities, but one made stable enough for careful study.',
          ),
          code(
            'This same sampling line is repeatable here because the runtime uses a seeded random process behind the choice.',
          ),
        ]),
      },
    ],
  },
  {
    id: 'append-or-stop',
    groupTitle: 'Append Or Stop',
    codeRanges: [{ start: 197, end: 199 }],
    viz: {
      focusNodeId: 'sample',
      cameraPoseId: 'sample',
      overlayKind: 'sample',
      emphasisNodeIds: ['sample'],
      emphasisEdgeIds: ['probabilities-to-sample'],
      focusWindowId: 'append-window',
      tensorTargets: [],
    },
    select: (trace) => trace.sampledTokenId,
    sceneCopy: {
      windowTitle: 'Append the chosen token or stop the loop',
      windowSubtitle:
        'The sampled token either becomes the next visible slot or ends generation if it is the stop marker.',
      note:
        'Autoregressive generation is this loop repeated again and again: predict, choose, append, and continue.',
    },
    steps: [
      {
        slug: 'append-or-stop',
        stepTitle: 'Append the chosen token unless it is the stop marker',
        copy: lesson([
          core(
            'The chosen token now decides whether generation continues or ends.',
          ),
          core(
            'If the sample is the special ',
            annotate('stop-marker', 'stop marker'),
            ', the loop ends. Otherwise the token is appended to the visible sequence.',
          ),
          scene(
            'Look at the lower window to see whether the chosen token will be appended to the sequence or treated as the stop signal.',
          ),
          code(
            'These highlighted lines check the sampled token, stop if needed, and append the token when generation should continue.',
          ),
        ]),
      },
      {
        slug: 'autoregressive-loop',
        stepTitle: 'See the whole process as one repeating autoregressive loop',
        copy: lesson([
          core(
            'The whole model now loops back and repeats the same process for the next slot.',
          ),
          core(
            'The token that was just appended becomes part of the visible history, and the model uses that longer history to predict the next continuation.',
          ),
          term(
            annotate('autoregressive-generation', 'Autoregressive generation'),
            ' means predicting one token, appending it, and then using the longer sequence to predict the next token.',
          ),
          scene(
            'When you step forward from here, the walkthrough wraps to the first stage for the next token with a longer visible history.',
          ),
          code(
            'These lines finish one inference pass and hand the updated sequence back to the outer loop for the next prediction.',
          ),
        ]),
      },
    ],
  },
]

export const inferencePhases: PhaseDefinition[] = inferenceGroups.flatMap(defineGroup)

export const vizFocusRanges: Record<VizNodeId | VizEdgeId, LineRange[]> = {
  context: [
    { start: 23, end: 27 },
    { start: 191, end: 196 },
  ],
  'token-embedding': [{ start: 109, end: 109 }],
  'position-embedding': [{ start: 110, end: 110 }],
  'residual-stream': [{ start: 111, end: 111 }],
  'norm-1': [{ start: 112, end: 112 }],
  qkv: [{ start: 117, end: 122 }],
  'attention-head-1': [
    { start: 124, end: 130 },
    { start: 97, end: 101 },
  ],
  'attention-head-2': [
    { start: 124, end: 130 },
    { start: 97, end: 101 },
  ],
  'attention-head-3': [
    { start: 124, end: 130 },
    { start: 97, end: 101 },
  ],
  'attention-head-4': [
    { start: 124, end: 130 },
    { start: 97, end: 101 },
  ],
  'attention-mix': [{ start: 131, end: 132 }],
  'residual-add-1': [{ start: 133, end: 134 }],
  'norm-2': [{ start: 136, end: 136 }],
  mlp: [{ start: 136, end: 141 }],
  logits: [{ start: 143, end: 143 }],
  probabilities: [
    { start: 97, end: 101 },
    { start: 195, end: 195 },
  ],
  sample: [{ start: 196, end: 199 }],
  'context-to-token-embedding': [{ start: 109, end: 109 }],
  'context-to-position-embedding': [{ start: 110, end: 110 }],
  'token-embedding-to-residual-stream': [{ start: 111, end: 111 }],
  'position-embedding-to-residual-stream': [{ start: 111, end: 111 }],
  'residual-stream-to-norm-1': [{ start: 112, end: 112 }],
  'norm-1-to-qkv': [{ start: 117, end: 122 }],
  'qkv-to-attention-head-1': [{ start: 117, end: 130 }],
  'qkv-to-attention-head-2': [{ start: 117, end: 130 }],
  'qkv-to-attention-head-3': [{ start: 117, end: 130 }],
  'qkv-to-attention-head-4': [{ start: 117, end: 130 }],
  'attention-head-1-to-attention-mix': [{ start: 131, end: 132 }],
  'attention-head-2-to-attention-mix': [{ start: 131, end: 132 }],
  'attention-head-3-to-attention-mix': [{ start: 131, end: 132 }],
  'attention-head-4-to-attention-mix': [{ start: 131, end: 132 }],
  'attention-mix-to-residual-add-1': [{ start: 133, end: 134 }],
  'residual-add-1-to-norm-2': [{ start: 136, end: 136 }],
  'norm-2-to-mlp': [{ start: 136, end: 141 }],
  'mlp-to-logits': [{ start: 143, end: 143 }],
  'logits-to-probabilities': [
    { start: 97, end: 101 },
    { start: 195, end: 195 },
  ],
  'probabilities-to-sample': [{ start: 196, end: 199 }],
}

export const trainingAppendix: AppendixSection[] = [
  {
    id: 'dataset',
    title: 'Dataset + Shuffle',
    description:
      'The checkpoint comes from the shuffled names dataset that the original script downloads and trains on once.',
    codeRanges: [{ start: 14, end: 27 }],
  },
  {
    id: 'autograd',
    title: 'Autograd Core',
    description:
      'The tiny `Value` class is how the Python script builds gradients during training. The site does not execute this path live.',
    codeRanges: [{ start: 29, end: 72 }],
  },
  {
    id: 'params',
    title: 'Parameter Init',
    description:
      'These matrix allocations define the exact 4,192-parameter model that the browser loads as static JSON.',
    codeRanges: [{ start: 74, end: 90 }],
  },
  {
    id: 'optimizer',
    title: 'Adam + Training Loop',
    description:
      'Training happens offline in the export script. The site explains inference only, but the weights are produced by the same loop.',
    codeRanges: [{ start: 146, end: 184 }],
  },
]
