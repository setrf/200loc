import type { TokenStepTrace } from '../model'
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

export interface TechnicalTerm {
  plainName: string
  term: string
  definition: string
}

export interface WalkthroughCopy {
  plainSummary: string
  whatHappens: string
  whyItMatters: string
  technicalTerms: TechnicalTerm[]
  sceneReading: string
  codeConnection: string
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
        copy: {
          plainSummary:
            'The model begins by looking at the small band of text it is allowed to read right now.',
          whatHappens:
            'That band includes the current slot plus every earlier visible slot to its left. Nothing to the right exists yet from the model’s point of view.',
          whyItMatters:
            'Next-token prediction only works if the model knows what has already been written and where the unfinished edge of the sequence is.',
          technicalTerms: [
            {
              plainName: 'readable history',
              term: 'context',
              definition:
                'Context is the part of the sequence the model is allowed to read when making its next prediction.',
            },
          ],
          sceneReading:
            'Read the context strip from left to right. Each labeled slot is one visible position the model can consult right now.',
          codeConnection:
            'These highlighted lines build the prefix, preserve the visible slots, and prepare the loop that predicts one new token at a time.',
        },
      },
      {
        slug: 'current-slot-goal',
        stepTitle: 'Focus on the slot being processed now',
        copy: {
          plainSummary:
            'One slot is special: it is the exact place the model is using to decide what should come next.',
          whatHappens:
            'The active slot holds the current token, and the model uses that slot together with the readable history behind it to predict the token for the next position.',
          whyItMatters:
            'This keeps the walkthrough grounded. Every later calculation is about improving the model’s internal picture of this one slot before it guesses the next token.',
          technicalTerms: [
            {
              plainName: 'one position in the sequence',
              term: 'slot',
              definition:
                'A slot is one position in the running sequence, such as p2 or p3 in the transition label.',
            },
          ],
          sceneReading:
            'Find the slot marked as current. The transition label shows the active slot on the left and the next slot being predicted on the right.',
          codeConnection:
            'The same highlighted lines keep track of the current position and drive the outer generation loop from one slot to the next.',
        },
      },
      {
        slug: 'token-ids',
        stepTitle: 'Turn characters into machine-readable ids',
        copy: {
          plainSummary:
            'Before math can happen, the visible characters must be converted into small integer labels the program can store and compare.',
          whatHappens:
            'Each visible character maps to a token id. The model does not compute on raw letters directly; it computes on those ids and on vectors derived from them.',
          whyItMatters:
            'This is the bridge from human-readable text to machine-readable state. Every later vector comes from these token ids.',
          technicalTerms: [
            {
              plainName: 'machine-readable label for one token',
              term: 'token id',
              definition:
                'A token id is the integer that names one vocabulary item inside the model.',
            },
            {
              plainName: 'special start marker',
              term: 'BOS',
              definition:
                'BOS means beginning of sequence. This tiny model also uses it as the stop token when sampling.',
            },
          ],
          sceneReading:
            'The labels in the context strip name the visible positions. The token ids behind those labels are what the embedding tables will consume next.',
          codeConnection:
            'The highlighted prefix-handling lines and the sampling lines together show the loop that turns text into token ids, predicts another id, and repeats.',
        },
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
      windowSubtitle:
        'The current token id selects one learned row from the token table.',
      note:
        'That learned row is the first numeric description of what the current token tends to mean in many contexts.',
    },
    steps: [
      {
        slug: 'meaning-lookup',
        stepTitle: 'Look up a learned meaning vector',
        copy: {
          plainSummary:
            'The current token id is used like an index into a table of learned meanings.',
          whatHappens:
            'The model selects one row from the token table. That row is a 16-number vector that gives the token a usable numeric shape.',
          whyItMatters:
            'A bare integer says only which symbol we have. The looked-up vector gives the model something it can compare, combine, and transform.',
          technicalTerms: [],
          sceneReading:
            'In the lower window, the highlighted row in the table is the selected token meaning, and the vector strip beneath it is that row pulled out for the current slot.',
          codeConnection:
            'This single highlighted line performs the token-table lookup that converts the current token id into a learned vector.',
        },
      },
      {
        slug: 'embedding-term',
        stepTitle: 'Name this learned lookup a token embedding',
        copy: {
          plainSummary:
            'This learned meaning vector has a standard name once you know what it is doing.',
          whatHappens:
            'The selected row is called the token embedding. In this codebase the table is also named WTE, short for word token embedding.',
          whyItMatters:
            'This term appears constantly in transformer literature. Defining it here lets the rest of the walkthrough stay precise without becoming mysterious.',
          technicalTerms: [
            {
              plainName: 'learned meaning vector for one token',
              term: 'token embedding',
              definition:
                'A token embedding is the vector retrieved for a token id from the model’s learned token table.',
            },
            {
              plainName: 'token embedding table',
              term: 'WTE',
              definition:
                'WTE is the weight matrix that stores one learned embedding row for each vocabulary token.',
            },
          ],
          sceneReading:
            'The table is the reusable memory of token meanings, and the extracted row is the embedding for the current token only.',
          codeConnection:
            'The same lookup line now has a name: it indexes the WTE matrix and retrieves the current token embedding.',
        },
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
        copy: {
          plainSummary:
            'The model also needs to know where the current token appears, not just which token it is.',
          whatHappens:
            'A second table is indexed by the current position rather than by the token id. The returned vector carries order information for this slot.',
          whyItMatters:
            'Without order information, the model could see which tokens exist but would lose the difference between start, middle, and end.',
          technicalTerms: [],
          sceneReading:
            'The highlighted row in this second table is chosen by the slot index, not by the token identity.',
          codeConnection:
            'This line performs the position-table lookup that pairs the slot index with a learned position vector.',
        },
      },
      {
        slug: 'position-term',
        stepTitle: 'Name this lookup a position embedding',
        copy: {
          plainSummary:
            'This second learned vector also has a standard name once its purpose is clear.',
          whatHappens:
            'The row chosen by slot index is called the position embedding. In this codebase the table is named WPE, short for word position embedding.',
          whyItMatters:
            'Transformers rely on both token identity and token position. This term is the standard way to talk about the position side.',
          technicalTerms: [
            {
              plainName: 'learned vector that marks a slot’s position',
              term: 'position embedding',
              definition:
                'A position embedding is the vector looked up from the position table for one slot index.',
            },
            {
              plainName: 'position embedding table',
              term: 'WPE',
              definition:
                'WPE is the weight matrix that stores one learned position vector for each possible slot.',
            },
          ],
          sceneReading:
            'The extracted vector in the lower window is the position signal that will be added to the token meaning vector.',
          codeConnection:
            'The same highlighted lookup line is the WPE access that produces the current slot’s position embedding.',
        },
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
      note:
        'This combined vector is the first full working state for the current slot.',
    },
    steps: [
      {
        slug: 'combine-signals',
        stepTitle: 'Combine what the token is with where it is',
        copy: {
          plainSummary:
            'The model now merges the token meaning vector and the position vector into one shared state.',
          whatHappens:
            'The two 16-number vectors are added element by element. The result is one vector that says both what token this is and where it appears.',
          whyItMatters:
            'From this point on, later computations can treat the slot as one unified object instead of juggling token identity and position separately.',
          technicalTerms: [
            {
              plainName: 'running slot state that carries information forward',
              term: 'residual stream',
              definition:
                'The residual stream is the main vector state that flows through the transformer and gets updated at each major block.',
            },
          ],
          sceneReading:
            'In the lower window, the first two vectors are the ingredients and the summed vector is the new running state for this slot.',
          codeConnection:
            'The first highlighted line in this range adds the token and position vectors into the slot state used by later layers.',
        },
      },
      {
        slug: 'normalize-scale',
        stepTitle: 'Rescale the running state before attention reads it',
        copy: {
          plainSummary:
            'Before the model reads from this state, it adjusts the overall scale so the numbers stay well behaved.',
          whatHappens:
            'The combined slot vector is passed through RMSNorm, which rescales it without changing its basic direction. The normalized result is what attention consumes next.',
          whyItMatters:
            'Keeping the scale under control helps the later projections react to content instead of to accidental size differences.',
          technicalTerms: [
            {
              plainName: 'root-mean-square normalization',
              term: 'RMSNorm',
              definition:
                'RMSNorm rescales a vector using its root-mean-square size so the model can keep values numerically stable.',
            },
          ],
          sceneReading:
            'The final vector in the lower window is the rescaled version of the summed state. That is the state that enters attention.',
          codeConnection:
            'The second highlighted line applies RMSNorm to the residual stream and produces the normalized slot state.',
        },
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
        copy: {
          plainSummary:
            'Attention is easiest to understand as a read operation over the visible history.',
          whatHappens:
            'The current slot is turned into several helper vectors that let it search the readable history, compare itself to earlier slots, and collect returned information.',
          whyItMatters:
            'This mental model is much simpler than memorizing letters first. Once attention is understood as reading, the later query, key, and value pieces make sense.',
          technicalTerms: [
            {
              plainName: 'content-based read over the visible history',
              term: 'attention',
              definition:
                'Attention is the mechanism that lets the current slot decide which visible slots matter and how strongly to read from them.',
            },
          ],
          sceneReading:
            'The three tables and three output strips in the lower window are three learned transforms of the same normalized input state.',
          codeConnection:
            'These highlighted lines multiply the normalized slot state by three learned weight tables to prepare the attention read.',
        },
      },
      {
        slug: 'query',
        stepTitle: 'Build a search request for what matters now',
        copy: {
          plainSummary:
            'One of the three derived vectors acts like a request describing what the current slot wants to find.',
          whatHappens:
            'The model multiplies the current slot state by the query weights to produce a search-style vector for each attention head.',
          whyItMatters:
            'This is how the current slot says what kind of earlier information would help it make the next prediction.',
          technicalTerms: [
            {
              plainName: 'search request vector',
              term: 'query',
              definition:
                'A query is the vector the current slot uses to ask what kind of information it should retrieve from visible slots.',
            },
          ],
          sceneReading:
            'Focus on the output labeled as the search request. That vector is what will be compared against the visible history.',
          codeConnection:
            'Part of the highlighted projection block applies the query weights to the normalized slot state and creates the query vectors.',
        },
        sceneCopy: {
          windowTitle: 'What this slot is looking for (query)',
        },
      },
      {
        slug: 'key',
        stepTitle: 'Build a description each visible slot can be matched against',
        copy: {
          plainSummary:
            'A second derived vector acts like a description card for matching one slot against another.',
          whatHappens:
            'The model applies a different weight table to produce key vectors. Each visible slot has keys cached from earlier work, and the current slot also creates its own key.',
          whyItMatters:
            'Without keys, the current slot would have no common format for asking whether another slot matches what it is looking for.',
          technicalTerms: [
            {
              plainName: 'matchable description vector',
              term: 'key',
              definition:
                'A key is the vector a slot exposes so a query can measure how relevant that slot is.',
            },
          ],
          sceneReading:
            'The key output strip is the description format used during comparison. In later steps those keys will be lined up against the query.',
          codeConnection:
            'The same highlighted projection block uses a second weight table to create the key vectors for attention.',
        },
        sceneCopy: {
          windowTitle: 'How each visible slot describes itself (key)',
        },
      },
      {
        slug: 'value',
        stepTitle: 'Build the information each visible slot is able to return',
        copy: {
          plainSummary:
            'A third derived vector carries the information that can actually be brought back after matching.',
          whatHappens:
            'The model applies the value weights to create value vectors. When attention decides which visible slots matter, it blends these value vectors and returns the result.',
          whyItMatters:
            'Queries decide where to look and keys decide who matches, but values are the payload that actually comes back.',
          technicalTerms: [
            {
              plainName: 'returnable information vector',
              term: 'value',
              definition:
                'A value is the vector a slot contributes when attention reads from it.',
            },
          ],
          sceneReading:
            'The value output strip is the part that will later be blended across visible slots and written back into the current slot state.',
          codeConnection:
            'The third projection in the highlighted code creates the value vectors that the attention read will later mix together.',
        },
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
        copy: {
          plainSummary:
            'The current search request is now compared against the visible slot descriptions.',
          whatHappens:
            'Each attention head takes its query and dots it against the visible keys. The result is one raw score per visible slot.',
          whyItMatters:
            'This is the model’s first pass at deciding which earlier positions are relevant to the current decision.',
          technicalTerms: [
            {
              plainName: 'raw match strength number',
              term: 'attention score',
              definition:
                'An attention score is the raw similarity value produced when a query is compared with a key.',
            },
          ],
          sceneReading:
            'Each row in the lower window shows one head’s raw match strengths across the visible positions.',
          codeConnection:
            'These highlighted lines compute the query-key comparisons that produce one attention-score row per head.',
        },
      },
      {
        slug: 'causal-visibility',
        stepTitle: 'Allow reading only from the current slot and earlier ones',
        copy: {
          plainSummary:
            'The model is not allowed to peek into future slots that have not been generated yet.',
          whatHappens:
            'Only the current position and earlier visible positions receive real scores. Future positions are blocked so they cannot influence the prediction.',
          whyItMatters:
            'This keeps the model honest during generation. It can use history, but it cannot cheat by looking ahead.',
          technicalTerms: [
            {
              plainName: 'future-blocking rule in autoregressive models',
              term: 'causal masking',
              definition:
                'Causal masking is the rule that hides future positions so each prediction uses only current and earlier tokens.',
            },
          ],
          sceneReading:
            'Only the visible columns in the score rows matter. Future positions outside the readable band are intentionally absent from the read.',
          codeConnection:
            'The same attention-score lines include the logic that limits each slot to the current position and the history behind it.',
        },
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
        copy: {
          plainSummary:
            'The raw match scores are now reshaped into a cleaner set of weights.',
          whatHappens:
            'A softmax function turns each score row into positive numbers that sum to one. Bigger scores become bigger read weights.',
          whyItMatters:
            'This gives the model a controlled way to divide attention across the visible slots instead of using unbounded raw numbers directly.',
          technicalTerms: [
            {
              plainName: 'score-to-distribution conversion',
              term: 'softmax',
              definition:
                'Softmax turns a list of scores into positive normalized weights that sum to one.',
            },
          ],
          sceneReading:
            'The higher a bar or cell is in the weight view, the more that head plans to read from that visible slot.',
          codeConnection:
            'The highlighted normalization lines apply softmax to the raw attention scores and produce the read weights.',
        },
      },
      {
        slug: 'weights-meaning',
        stepTitle: 'Read the weights as a probability-like focus pattern',
        copy: {
          plainSummary:
            'After normalization, each row behaves like a distribution of attention across visible slots.',
          whatHappens:
            'Every head assigns more weight to some positions and less to others, and all of the weights together describe its read pattern for the current slot.',
          whyItMatters:
            'This is the moment where the model’s focus becomes interpretable. You can now see where each head is concentrating its read.',
          technicalTerms: [
            {
              plainName: 'one independent read channel inside attention',
              term: 'attention head',
              definition:
                'An attention head is one separate set of query, key, and value computations with its own learned read pattern.',
            },
          ],
          sceneReading:
            'Compare the rows across heads. Different heads can place their mass on different visible positions at the same time.',
          codeConnection:
            'The same softmax-related lines produce one normalized read distribution per attention head.',
        },
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
      windowSubtitle:
        'Each head uses its read weights to mix value vectors into one returned result.',
      note:
        'This is the actual information transfer step of attention.',
    },
    steps: [
      {
        slug: 'blend-values',
        stepTitle: 'Blend returned information using the read weights',
        copy: {
          plainSummary:
            'The model now uses the learned weights to combine the value vectors from visible slots.',
          whatHappens:
            'Each head multiplies every visible value vector by that slot’s weight and adds the results together into one returned vector.',
          whyItMatters:
            'This is where useful information actually moves from earlier slots into the current slot’s computation.',
          technicalTerms: [],
          sceneReading:
            'In each head’s panel, the table shows the candidate value vectors and the result strip shows the single mixed vector returned by that head.',
          codeConnection:
            'These highlighted lines apply the attention weights to the value vectors and sum the weighted results for each head.',
        },
      },
      {
        slug: 'heads-differ',
        stepTitle: 'Let different heads return different kinds of information',
        copy: {
          plainSummary:
            'The heads do not have to read the same thing, and that is one reason attention is powerful.',
          whatHappens:
            'Because each head has its own query, key, and value weights, one head can focus on one relationship while another focuses elsewhere.',
          whyItMatters:
            'Parallel heads let the model gather several kinds of evidence about the same slot at once instead of forcing one single read pattern to do everything.',
          technicalTerms: [],
          sceneReading:
            'Compare the mixed result strips across heads. They often differ because each head weighted the visible slots differently.',
          codeConnection:
            'The same weighted-value lines are executed independently for each head, producing multiple returned vectors in parallel.',
        },
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
        copy: {
          plainSummary:
            'The separate head outputs are first stitched together so the model can use them as one combined read result.',
          whatHappens:
            'The four returned head vectors are concatenated into a single wider vector that carries all head outputs side by side.',
          whyItMatters:
            'This preserves the distinct information each head found while preparing it for the next learned transform.',
          technicalTerms: [],
          sceneReading:
            'The first vector in the lower window is the heads joined end to end before they are projected back down.',
          codeConnection:
            'The first part of this highlighted range takes the per-head outputs and combines them into one wider attention result.',
        },
      },
      {
        slug: 'project-back',
        stepTitle: 'Project the combined read back to the model’s main width',
        copy: {
          plainSummary:
            'The joined head result is too wide, so the model maps it back into the same width used by the running slot state.',
          whatHappens:
            'A learned output weight table compresses the concatenated head vector back to the model width of 16 numbers.',
          whyItMatters:
            'This lets the attention result re-enter the main slot state in the same format used everywhere else in the transformer.',
          technicalTerms: [
            {
              plainName: 'learned map from concatenated head output back to the model width',
              term: 'output projection',
              definition:
                'The output projection is the learned linear map that turns the joined head results back into one model-width vector.',
            },
          ],
          sceneReading:
            'The weight table and the second vector in the lower window show the transformed attention result after projection.',
          codeConnection:
            'The same highlighted range applies the attention output weights to the concatenated head vector.',
        },
        sceneCopy: {
          windowTitle: 'Project the combined read back to the model width',
        },
      },
      {
        slug: 'add-back',
        stepTitle: 'Add the read result back onto the running slot state',
        copy: {
          plainSummary:
            'The attention result is added onto the slot’s running state instead of replacing it.',
          whatHappens:
            'The projected attention output is summed with the earlier residual stream, producing an updated slot state that now includes information read from visible history.',
          whyItMatters:
            'Residual addition lets the original path survive while attention contributes a focused update.',
          technicalTerms: [
            {
              plainName: 'skip-style update that adds new work onto the old state',
              term: 'residual connection',
              definition:
                'A residual connection adds a block’s output back onto the running state instead of discarding the earlier state.',
            },
          ],
          sceneReading:
            'The last vector in the lower window is the updated running state after the attention contribution has been added back in.',
          codeConnection:
            'The second line in this highlighted range performs the residual add that writes attention’s contribution back into the slot state.',
        },
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
        copy: {
          plainSummary:
            'The model now works on this slot by itself rather than comparing it with other slots.',
          whatHappens:
            'After another normalization step, the updated slot state enters a feed-forward block that performs learned per-slot computation.',
          whyItMatters:
            'Attention gathers information from across the sequence, but the model still needs a place to transform that gathered information locally.',
          technicalTerms: [
            {
              plainName: 'per-slot feed-forward block',
              term: 'MLP',
              definition:
                'MLP stands for multilayer perceptron. Here it is the two-layer feed-forward block applied independently to each slot.',
            },
          ],
          sceneReading:
            'The lower window now follows one slot through a local transformation pipeline rather than through cross-slot reading.',
          codeConnection:
            'These highlighted lines normalize the post-attention state and feed it into the model’s two-layer MLP block.',
        },
        sceneCopy: {
          windowTitle: 'Local computation after attention (MLP block)',
        },
      },
      {
        slug: 'expand-hidden',
        stepTitle: 'Expand the slot into a larger hidden space',
        copy: {
          plainSummary:
            'The first MLP layer gives the slot more room to express intermediate patterns.',
          whatHappens:
            'A learned linear map expands the 16-number slot state into a 64-number hidden vector before the nonlinearity is applied.',
          whyItMatters:
            'The larger hidden space gives the model extra capacity to form richer combinations of the information already gathered.',
          technicalTerms: [
            {
              plainName: 'larger temporary workspace inside the MLP',
              term: 'hidden layer',
              definition:
                'A hidden layer is an internal vector representation used during computation before the final output of a block is produced.',
            },
          ],
          sceneReading:
            'The first weight table and the hidden vector strip show the expansion from model width to a larger internal workspace.',
          codeConnection:
            'The early lines in this MLP range apply the first feed-forward weight table and create the hidden vector.',
        },
      },
      {
        slug: 'relu',
        stepTitle: 'Keep only the positive hidden activations',
        copy: {
          plainSummary:
            'The model then applies a simple rule that keeps positive values and drops negative ones.',
          whatHappens:
            'A ReLU nonlinearity sets negative hidden values to zero while leaving positive values unchanged.',
          whyItMatters:
            'Without a nonlinearity, stacked linear layers would collapse into one bigger linear layer and lose expressive power.',
          technicalTerms: [
            {
              plainName: 'rectified linear unit',
              term: 'ReLU',
              definition:
                'ReLU is a nonlinearity that outputs zero for negative inputs and leaves positive inputs unchanged.',
            },
          ],
          sceneReading:
            'In the hidden vector strip, zeros and positive values show the effect of the ReLU gate.',
          codeConnection:
            'The middle part of the highlighted MLP code applies ReLU to the expanded hidden vector.',
        },
      },
      {
        slug: 'project-down',
        stepTitle: 'Project back down and add another residual update',
        copy: {
          plainSummary:
            'The transformed hidden state is compressed back to model width and added onto the running slot state.',
          whatHappens:
            'A second learned weight table maps the hidden vector back to 16 numbers, and that result is added back onto the residual stream.',
          whyItMatters:
            'This returns the local computation to the same shared slot format used by the rest of the network while preserving the earlier state underneath it.',
          technicalTerms: [],
          sceneReading:
            'The final two vectors show the projected MLP result and the updated running state after the residual add.',
          codeConnection:
            'The later MLP lines apply the second projection and then perform another residual add onto the slot state.',
        },
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
        copy: {
          plainSummary:
            'The model now asks how well the finished slot state supports each possible next token.',
          whatHappens:
            'A learned output table compares the final slot state against every vocabulary row and produces one raw score for each candidate token.',
          whyItMatters:
            'This is the first moment where the model’s internal state becomes directly comparable to concrete next-token options.',
          technicalTerms: [],
          sceneReading:
            'The lower window shows the output weight table, the final slot state entering it, and the raw scores produced for the vocabulary.',
          codeConnection:
            'This single highlighted line projects the final slot state through the output weights and produces vocabulary-wide scores.',
        },
      },
      {
        slug: 'lm-head-logits',
        stepTitle: 'Name the scoring layer and its raw outputs',
        copy: {
          plainSummary:
            'The scoring layer and the raw scores both have standard names in language-modeling work.',
          whatHappens:
            'The output table is called the language-model head, or LM head, and the raw scores it produces are called logits.',
          whyItMatters:
            'These terms appear everywhere in model discussions, and they matter because the next step will convert logits into probabilities.',
          technicalTerms: [
            {
              plainName: 'final vocabulary scoring layer',
              term: 'LM head',
              definition:
                'The LM head is the final learned linear layer that maps the slot state to one score per vocabulary token.',
            },
            {
              plainName: 'raw, unnormalized preference score',
              term: 'logit',
              definition:
                'A logit is the raw score assigned to one vocabulary option before probabilities are computed.',
            },
          ],
          sceneReading:
            'Read the score vector as a list of raw preferences, not as percentages. Bigger logits mean stronger model preference before normalization.',
          codeConnection:
            'The same output-projection line is now named precisely: it runs the LM head and produces the logits.',
        },
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
        'This makes the model’s preferences readable as probabilities while keeping every candidate in the same competition.',
    },
    steps: [
      {
        slug: 'convert-to-probabilities',
        stepTitle: 'Convert raw scores into probabilities',
        copy: {
          plainSummary:
            'The raw scores are now turned into a proper probability distribution across the vocabulary.',
          whatHappens:
            'The logits are optionally temperature-scaled and then passed through softmax so that every vocabulary token receives a probability.',
          whyItMatters:
            'Probabilities are easier to inspect and sample from than raw scores because they live on a common normalized scale.',
          technicalTerms: [
            {
              plainName: 'knob that sharpens or flattens the distribution before sampling',
              term: 'temperature',
              definition:
                'Temperature rescales logits before softmax so the resulting distribution can become sharper or flatter.',
            },
          ],
          sceneReading:
            'The bars or cells now show probabilities over the vocabulary, so the largest values mark the strongest next-token candidates.',
          codeConnection:
            'The highlighted line at the end of inference applies the same softmax idea used earlier in attention, but this time over vocabulary logits.',
        },
      },
      {
        slug: 'probability-not-certainty',
        stepTitle: 'Read high probability as preference, not certainty',
        copy: {
          plainSummary:
            'A high probability means the model prefers an option, but it does not mean the option is guaranteed.',
          whatHappens:
            'The probabilities rank the candidate next tokens. Several tokens can still have meaningful mass, especially when the model is uncertain.',
          whyItMatters:
            'Understanding this prevents a common mistake: thinking the model already knows one fixed answer before sampling actually chooses a token.',
          technicalTerms: [],
          sceneReading:
            'Compare the tallest bar with the rest of the distribution. The gap tells you how decisive or uncertain the model is at this moment.',
          codeConnection:
            'The same normalization step produces a full vocabulary distribution, not just the single best token.',
        },
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
      windowSubtitle:
        'The probability distribution is turned into one actual token choice that can be fed back into the loop.',
      note:
        'A distribution is a set of possibilities. Sampling collapses it into one concrete continuation.',
    },
    steps: [
      {
        slug: 'pick-token',
        stepTitle: 'Pick one concrete next token from the distribution',
        copy: {
          plainSummary:
            'The model now stops listing possibilities and actually chooses one next token.',
          whatHappens:
            'A sampling step uses the probability distribution to select one token id as the concrete continuation for the next position.',
          whyItMatters:
            'Generation cannot proceed on probabilities alone. The loop needs one actual token to append and feed back into the model.',
          technicalTerms: [
            {
              plainName: 'drawing one concrete token from a probability distribution',
              term: 'sampling',
              definition:
                'Sampling is the process of choosing one token according to the model’s predicted probabilities.',
            },
          ],
          sceneReading:
            'The highlighted token in the lower window is the one chosen from the full distribution shown beside it.',
          codeConnection:
            'This highlighted line takes the probability distribution and turns it into one sampled token id.',
        },
      },
      {
        slug: 'seeded-determinism',
        stepTitle: 'Use a seeded sampler so the demo stays repeatable',
        copy: {
          plainSummary:
            'This walkthrough uses a repeatable random process so the same prefix produces the same shown result.',
          whatHappens:
            'The sampler is seeded, which means its random choices follow a fixed repeatable pattern inside the demo instead of changing on every refresh.',
          whyItMatters:
            'Repeatability makes the walkthrough teachable. The user can step through the same sequence again and see the same explanations line up with the same outputs.',
          technicalTerms: [
            {
              plainName: 'repeatable random-number setup',
              term: 'seeded sampler',
              definition:
                'A seeded sampler uses a fixed initial random state so repeated runs can produce the same sequence of sampled choices.',
            },
          ],
          sceneReading:
            'The selected token is still chosen from probabilities, but the repeatable seed makes the walkthrough stable enough to study carefully.',
          codeConnection:
            'The same sampling line is deterministic here because the runtime uses a seeded random process behind the choice.',
        },
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
        copy: {
          plainSummary:
            'The chosen token now decides whether generation continues or ends.',
          whatHappens:
            'If the sampled token is the special BOS marker, generation stops in this tiny model. Otherwise the token is appended as the next visible slot.',
          whyItMatters:
            'This is the point where one prediction changes the visible sequence itself and sets up the next pass through the model.',
          technicalTerms: [],
          sceneReading:
            'The lower window tells you whether the chosen token will be appended to the sequence or interpreted as the signal to stop.',
          codeConnection:
            'These highlighted lines check the sampled token, decide whether the loop is done, and append the token when generation should continue.',
        },
      },
      {
        slug: 'autoregressive-loop',
        stepTitle: 'See the whole process as one repeating autoregressive loop',
        copy: {
          plainSummary:
            'The entire model now loops back and repeats the same sequence of steps for the next slot.',
          whatHappens:
            'The newly appended token becomes part of the readable history, the next slot becomes current, and the model runs the same inference pipeline again.',
          whyItMatters:
            'This repetition is the core of language-model generation. One token at a time, the model extends its own context and predicts the next continuation.',
          technicalTerms: [
            {
              plainName: 'predicting one token, appending it, then using it to predict the next',
              term: 'autoregressive generation',
              definition:
                'Autoregressive generation is the process of repeatedly predicting the next token from the sequence built so far.',
            },
          ],
          sceneReading:
            'When you press Next past this point, the walkthrough wraps to the first stage for the next token and the whole pipeline starts again with a longer visible history.',
          codeConnection:
            'The append-or-stop lines close one inference pass and hand the updated sequence back to the outer loop for the next prediction.',
        },
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
