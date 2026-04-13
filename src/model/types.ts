export type BackendName = 'cpu' | 'webgpu'

export interface ModelConfig {
  vocabSize: number
  bosToken: number
  nLayer: number
  nEmbd: number
  nHead: number
  headDim: number
  blockSize: number
}

export interface MatrixDataJson {
  rows: number
  cols: number
  data: number[]
}

export interface MatrixData {
  rows: number
  cols: number
  data: Float32Array
}

export interface ModelBundleJson {
  config: ModelConfig
  vocab: string[]
  weights: Record<string, MatrixDataJson>
  sampling: {
    temperature: number
    seed: number
  }
  training?: {
    steps: number
    loss: number
    docs: number
  }
}

export interface ModelBundle {
  config: ModelConfig
  vocab: string[]
  weights: Record<string, MatrixData>
  sampling: {
    temperature: number
    seed: number
  }
  training?: {
    steps: number
    loss: number
    docs: number
  }
}

export interface TopCandidate {
  tokenId: number
  token: string
  probability: number
}

export interface HeadTrace {
  q: number[]
  kSlices: number[][]
  vSlices: number[][]
  scores: number[]
  weights: number[]
  mixedValue: number[]
}

export interface TokenStepTrace {
  tokenId: number
  positionId: number
  tokenEmbedding: number[]
  positionEmbedding: number[]
  xAfterEmbed: number[]
  xAfterNorm: number[]
  heads: HeadTrace[]
  attnOutput: number[]
  xAfterAttnResidual: number[]
  mlpHidden: number[]
  mlpOutput: number[]
  xAfterMlpResidual: number[]
  logits: number[]
  probs: number[]
  sampledTokenId: number
  topCandidates: TopCandidate[]
}

export interface SessionState {
  contextTokenIds: number[]
  generatedTokenIds: number[]
  visibleTokenIds: number[]
  keys: number[][][]
  values: number[][][]
  position: number
  done: boolean
  backend: BackendName
  currentTokenId: number
  doneReason?: 'bos' | 'context'
  sampleState: number
}

export interface InferenceEngine {
  init(bundle: ModelBundle): Promise<void>
  runPrefix(prefixTokenIds: number[]): Promise<SessionState>
  step(session: SessionState): Promise<TokenStepTrace>
  dispose(): void
}

export interface PrefixNormalization {
  normalized: string
  removedUnsupported: boolean
  truncated: boolean
}

export interface EngineDiagnostics {
  activeBackend: BackendName
  fallbackReason?: string
}
