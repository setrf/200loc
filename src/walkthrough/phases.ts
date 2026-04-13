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

export interface PhaseDefinition {
  id: string
  title: string
  codeRanges: LineRange[]
  viz: PhaseVizConfig
  select: (trace: TokenStepTrace) => unknown
  explanationTitle: (
    trace: TokenStepTrace,
    tokenLabel: (tokenId: number) => string,
  ) => string
  explanationBody: (
    trace: TokenStepTrace,
    tokenLabel: (tokenId: number) => string,
  ) => string
  explanationWhy: (
    trace: TokenStepTrace,
    tokenLabel: (tokenId: number) => string,
  ) => string
}

export interface AppendixSection {
  id: string
  title: string
  description: string
  codeRanges: LineRange[]
}

export const inferencePhases: PhaseDefinition[] = [
  {
    id: 'tokenize',
    title: 'Tokenize Prefix',
    codeRanges: [
      { start: 23, end: 27 },
      { start: 191, end: 196 },
    ],
    viz: {
      focusNodeId: 'context',
      cameraPoseId: 'input',
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
    explanationTitle: (trace, tokenLabel) =>
      `Stand on p${trace.positionId}:${tokenLabel(trace.tokenId)}`,
    explanationBody: (trace, tokenLabel) =>
      `The model starts from the current slot, p${trace.positionId}:${tokenLabel(trace.tokenId)}, plus every visible slot already cached to its left.`,
    explanationWhy: () =>
      'Autoregressive decoding always predicts one token ahead from the current slot and the context behind it.',
  },
  {
    id: 'token-embedding',
    title: 'Token Embedding',
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
    explanationTitle: (trace, tokenLabel) =>
      `Look up the row for ${tokenLabel(trace.tokenId)}`,
    explanationBody: (trace, tokenLabel) =>
      `${tokenLabel(trace.tokenId)} is still just a token id. The token embedding table turns it into a learned 16-dimensional vector the network can compute with.`,
    explanationWhy: () =>
      'Discrete ids have no geometry. Embeddings give the model a continuous space where similar token behavior can be learned.',
  },
  {
    id: 'position-embedding',
    title: 'Position Embedding',
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
    explanationTitle: (trace) => `Inject the signal for p${trace.positionId}`,
    explanationBody: (trace) =>
      `A second lookup encodes position ${trace.positionId}. The same token should mean different things at the start, middle, or end of the visible sequence.`,
    explanationWhy: () =>
      'Without position information, the model would know which tokens exist but not where they occur.',
  },
  {
    id: 'embed-add-norm',
    title: 'Add + RMSNorm',
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
    explanationTitle: (trace) => `Build the residual stream for p${trace.positionId}`,
    explanationBody: () =>
      'Token and position vectors are added together, then RMSNorm rescales the combined state before attention reads from it.',
    explanationWhy: () =>
      'This keeps the signal numerically stable so later projections can respond to content instead of uncontrolled magnitude drift.',
  },
  {
    id: 'qkv',
    title: 'Q / K / V',
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
    explanationTitle: (trace) =>
      `Project p${trace.positionId} into query, key, and value`,
    explanationBody: () =>
      'The normalized slot is projected three ways. Queries ask what matters now, keys describe each visible slot, and values carry the information that can be mixed back in.',
    explanationWhy: () =>
      'Attention is just a read operation split into “where to look” and “what to bring back.”',
  },
  {
    id: 'attention-scores',
    title: 'Attention Scores',
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
    explanationTitle: (trace) =>
      `Compare p${trace.positionId} against every visible slot`,
    explanationBody: () =>
      'Each head dots the current query against cached keys from every visible position, including the current one, to produce raw attention scores.',
    explanationWhy: () =>
      'These scores are the model’s first pass at deciding which positions are relevant before turning them into probabilities.',
  },
  {
    id: 'attention-softmax',
    title: 'Attention Weights',
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
    explanationTitle: (trace) => `Normalize the read weights for p${trace.positionId}`,
    explanationBody: () =>
      'Softmax converts each head’s score vector into a probability distribution over the visible slots.',
    explanationWhy: () =>
      'That turns attention into a controlled weighted read rather than an arbitrary sum.',
  },
  {
    id: 'weighted-values',
    title: 'Weighted Values',
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
    explanationTitle: (trace) => `Read values back into p${trace.positionId}`,
    explanationBody: () =>
      'Each head uses its attention weights to blend value vectors from the visible slots into one compact readout.',
    explanationWhy: () =>
      'This is the real information transfer step: attention decides where to look, then values decide what returns.',
  },
  {
    id: 'attn-out',
    title: 'Output Projection + Residual',
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
    explanationTitle: (trace) =>
      `Write the attention read back into p${trace.positionId}`,
    explanationBody: () =>
      'The head outputs are concatenated, projected back to model width, and added onto the residual stream.',
    explanationWhy: () =>
      'Residual connections let the original path survive while attention contributes a focused correction.',
  },
  {
    id: 'mlp',
    title: 'MLP Block',
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
    explanationTitle: (trace) => `Transform p${trace.positionId} locally`,
    explanationBody: () =>
      'A second norm feeds a two-layer MLP that expands the slot, applies ReLU, projects back down, and adds another residual update.',
    explanationWhy: () =>
      'Attention moves information between positions. The MLP is where each position performs local nonlinear computation on that mixed context.',
  },
  {
    id: 'lm-head',
    title: 'LM Head Logits',
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
    explanationTitle: (trace) =>
      `Score every next-token option for p${trace.positionId + 1}`,
    explanationBody: () =>
      'The final residual state is projected into one raw score per vocabulary token.',
    explanationWhy: () =>
      'Logits are the model’s unnormalized preferences before probability and sampling turn them into one concrete continuation.',
  },
  {
    id: 'probabilities',
    title: 'Softmax Probabilities',
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
    explanationTitle: (trace) =>
      `Normalize the next-token distribution for p${trace.positionId + 1}`,
    explanationBody: () =>
      'Temperature scaling and softmax convert logits into an explicit probability distribution over the vocabulary.',
    explanationWhy: () =>
      'This is the step where “what the model knows” becomes a concrete distribution you can inspect or sample from.',
  },
  {
    id: 'sample',
    title: 'Sample Token',
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
    explanationTitle: (trace, tokenLabel) =>
      `Choose ${tokenLabel(trace.sampledTokenId)} for p${trace.positionId + 1}`,
    explanationBody: (trace, tokenLabel) =>
      `A deterministic seeded sampler turns the distribution into one concrete token, ${tokenLabel(trace.sampledTokenId)}.`,
    explanationWhy: () =>
      'Sampling is what converts probabilities into an actual continuation that can be fed back into the next step.',
  },
  {
    id: 'append-or-stop',
    title: 'Append Or Stop',
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
    explanationTitle: (trace, tokenLabel) =>
      tokenLabel(trace.sampledTokenId) === 'BOS'
        ? 'Stop generation on BOS'
        : `Append ${tokenLabel(trace.sampledTokenId)} and move forward`,
    explanationBody: (trace, tokenLabel) =>
      tokenLabel(trace.sampledTokenId) === 'BOS'
        ? 'The sampled token is BOS, which this tiny model uses as the stop token. Generation ends here.'
        : `${tokenLabel(trace.sampledTokenId)} is appended as the next visible slot and becomes the current token on the next loop.`,
    explanationWhy: () =>
      'Autoregressive generation is just this loop repeated: predict, sample, append, and run the model again.',
  },
]

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
