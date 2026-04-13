import type { TokenStepTrace } from '../model'

export interface LineRange {
  start: number
  end: number
}

export interface PhaseDefinition {
  id: string
  title: string
  codeRanges: LineRange[]
  select: (trace: TokenStepTrace) => unknown
  narration: (trace: TokenStepTrace, tokenLabel: (tokenId: number) => string) => {
    lead: string
    why: string
  }
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
    select: (trace) => ({
      tokenId: trace.tokenId,
      positionId: trace.positionId,
    }),
    narration: (trace, tokenLabel) => ({
      lead: `The model is now standing on token ${tokenLabel(trace.tokenId)} at position ${trace.positionId}.`,
      why: 'Autoregressive decoding always predicts the next token from the current token plus everything cached before it.',
    }),
  },
  {
    id: 'token-embedding',
    title: 'Token Embedding',
    codeRanges: [{ start: 109, end: 109 }],
    select: (trace) => trace.tokenEmbedding,
    narration: (trace, tokenLabel) => ({
      lead: `Row lookup turns ${tokenLabel(trace.tokenId)} into a learned 16-dimensional vector.`,
      why: 'A token id is discrete. The embedding table is what gives the network continuous coordinates to compute with.',
    }),
  },
  {
    id: 'position-embedding',
    title: 'Position Embedding',
    codeRanges: [{ start: 110, end: 110 }],
    select: (trace) => trace.positionEmbedding,
    narration: (trace) => ({
      lead: `A second lookup injects position ${trace.positionId} into the residual stream.`,
      why: 'Without position information, the model would know which letters exist but not where they occur in the sequence.',
    }),
  },
  {
    id: 'embed-add-norm',
    title: 'Add + RMSNorm',
    codeRanges: [{ start: 111, end: 112 }],
    select: (trace) => trace.xAfterNorm,
    narration: () => ({
      lead: 'Token and position vectors are added, then RMSNorm rescales the combined signal.',
      why: 'This keeps magnitudes stable so later projections can focus on content instead of raw scale drift.',
    }),
  },
  {
    id: 'qkv',
    title: 'Q / K / V',
    codeRanges: [{ start: 117, end: 122 }],
    select: (trace) => trace.heads,
    narration: () => ({
      lead: 'The normalized residual stream is projected into query, key, and value vectors.',
      why: 'Queries ask what matters now, keys advertise what each position contains, and values carry the information to mix back in.',
    }),
  },
  {
    id: 'attention-scores',
    title: 'Attention Scores',
    codeRanges: [{ start: 124, end: 129 }],
    select: (trace) => trace.heads.map((head) => head.scores),
    narration: () => ({
      lead: 'Each head compares the current query against all cached keys, including the current token.',
      why: 'These raw scores decide which earlier positions this step should listen to before any probabilities are formed.',
    }),
  },
  {
    id: 'attention-softmax',
    title: 'Attention Weights',
    codeRanges: [
      { start: 97, end: 101 },
      { start: 130, end: 130 },
    ],
    select: (trace) => trace.heads.map((head) => head.weights),
    narration: () => ({
      lead: 'Softmax turns each head’s score vector into a probability distribution over positions.',
      why: 'This makes attention a convex weighted read instead of an uncontrolled sum.',
    }),
  },
  {
    id: 'weighted-values',
    title: 'Weighted Values',
    codeRanges: [{ start: 131, end: 132 }],
    select: (trace) => trace.heads.map((head) => head.mixedValue),
    narration: () => ({
      lead: 'Each head uses those weights to blend value vectors into one compact readout.',
      why: 'This is the actual information transfer step: attention decides where to look, then values decide what comes back.',
    }),
  },
  {
    id: 'attn-out',
    title: 'Output Projection + Residual',
    codeRanges: [{ start: 133, end: 134 }],
    select: (trace) => ({
      attnOutput: trace.attnOutput,
      residual: trace.xAfterAttnResidual,
    }),
    narration: () => ({
      lead: 'The concatenated head outputs are projected back to model width and added to the residual stream.',
      why: 'Residual addition preserves the original path while letting attention contribute a focused correction.',
    }),
  },
  {
    id: 'mlp',
    title: 'MLP Block',
    codeRanges: [{ start: 136, end: 141 }],
    select: (trace) => ({
      hidden: trace.mlpHidden,
      output: trace.mlpOutput,
      residual: trace.xAfterMlpResidual,
    }),
    narration: () => ({
      lead: 'A two-layer MLP expands, thresholds with ReLU, projects back down, and adds another residual update.',
      why: 'Attention moves information between positions. The MLP is where each position performs local nonlinear computation on that mixed context.',
    }),
  },
  {
    id: 'lm-head',
    title: 'LM Head Logits',
    codeRanges: [{ start: 143, end: 143 }],
    select: (trace) => trace.logits,
    narration: () => ({
      lead: 'The final residual stream is projected into one score for every possible next token.',
      why: 'Logits are the model’s raw preferences before normalization and sampling.',
    }),
  },
  {
    id: 'probabilities',
    title: 'Softmax Probabilities',
    codeRanges: [
      { start: 97, end: 101 },
      { start: 195, end: 195 },
    ],
    select: (trace) => trace.topCandidates,
    narration: () => ({
      lead: 'Temperature scaling and softmax convert logits into the next-token distribution.',
      why: 'This is the point where “what the model knows” becomes an explicit probability over the vocabulary.',
    }),
  },
  {
    id: 'sample',
    title: 'Sample Token',
    codeRanges: [{ start: 196, end: 196 }],
    select: (trace) => trace.sampledTokenId,
    narration: (trace, tokenLabel) => ({
      lead: `A deterministic seeded sampler chooses ${tokenLabel(trace.sampledTokenId)} from that distribution.`,
      why: 'Sampling turns a probability vector into one concrete continuation that can be fed back into the next step.',
    }),
  },
  {
    id: 'append-or-stop',
    title: 'Append Or Stop',
    codeRanges: [{ start: 197, end: 199 }],
    select: (trace) => trace.sampledTokenId,
    narration: (trace, tokenLabel) => ({
      lead:
        tokenLabel(trace.sampledTokenId) === 'BOS'
          ? 'The sampled token is BOS, so generation stops.'
          : `The sampled token ${tokenLabel(trace.sampledTokenId)} is appended and becomes the next current token.`,
      why: 'Autoregressive generation is just this loop repeated: predict, sample, append, and run the model again.',
    }),
  },
]

export const trainingAppendix: AppendixSection[] = [
  {
    id: 'dataset',
    title: 'Dataset + Shuffle',
    description: 'The checkpoint comes from the shuffled names dataset that the original script downloads and trains on once.',
    codeRanges: [{ start: 14, end: 27 }],
  },
  {
    id: 'autograd',
    title: 'Autograd Core',
    description: 'The tiny `Value` class is how the Python script builds gradients during training. The site does not execute this path live.',
    codeRanges: [{ start: 29, end: 72 }],
  },
  {
    id: 'params',
    title: 'Parameter Init',
    description: 'These matrix allocations define the exact 4,192-parameter model that the browser loads as static JSON.',
    codeRanges: [{ start: 74, end: 90 }],
  },
  {
    id: 'optimizer',
    title: 'Adam + Training Loop',
    description: 'Training happens offline in the export script. The site explains inference only, but the weights are produced by the same loop.',
    codeRanges: [{ start: 146, end: 184 }],
  },
]
