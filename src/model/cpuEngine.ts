import {
  addVectors,
  linear,
  matrixRow,
  relu,
  rmsnorm,
  softmax,
  topCandidates,
} from './math'
import { SeededRandom } from './seededRandom'
import type {
  HeadTrace,
  InferenceEngine,
  ModelBundle,
  SessionState,
  TokenStepTrace,
} from './types'

export class ReferenceCpuEngine implements InferenceEngine {
  private bundle: ModelBundle | null = null

  async init(bundle: ModelBundle) {
    this.bundle = bundle
  }

  async runPrefix(prefixTokenIds: number[]): Promise<SessionState> {
    const bundle = this.requireBundle()
    const session: SessionState = {
      contextTokenIds: prefixTokenIds.slice(),
      generatedTokenIds: [],
      visibleTokenIds: prefixTokenIds.slice(),
      keys: Array.from({ length: bundle.config.nLayer }, () => []),
      values: Array.from({ length: bundle.config.nLayer }, () => []),
      position: prefixTokenIds.length,
      done: false,
      backend: 'cpu',
      currentTokenId:
        prefixTokenIds[prefixTokenIds.length - 1] ?? bundle.config.bosToken,
      sampleState: bundle.sampling.seed >>> 0,
    }

    const consumed =
      prefixTokenIds.length > 0
        ? [bundle.config.bosToken, ...prefixTokenIds.slice(0, -1)]
        : []

    consumed.forEach((tokenId, positionId) => {
      this.appendToCache(session, tokenId, positionId)
    })

    return session
  }

  async step(session: SessionState): Promise<TokenStepTrace> {
    if (session.done) {
      throw new Error('CPU session is terminal')
    }

    const bundle = this.requireBundle()
    const config = bundle.config
    const tokenEmbedding = matrixRow(bundle.weights.wte, session.currentTokenId)
    const positionEmbedding = matrixRow(bundle.weights.wpe, session.position)
    const xAfterEmbed = addVectors(tokenEmbedding, positionEmbedding)
    const xAfterNorm = rmsnorm(xAfterEmbed)
    const attnInput = rmsnorm(xAfterNorm)
    const q = linear(attnInput, bundle.weights['layer0.attn_wq'])
    const k = linear(attnInput, bundle.weights['layer0.attn_wk'])
    const v = linear(attnInput, bundle.weights['layer0.attn_wv'])

    session.keys[0].push(k)
    session.values[0].push(v)

    const heads: HeadTrace[] = []
    const concatenated = new Array<number>(config.nEmbd).fill(0)

    for (let head = 0; head < config.nHead; head += 1) {
      const start = head * config.headDim
      const end = start + config.headDim
      const qSlice = q.slice(start, end)
      const kSlices = session.keys[0].map((row) => row.slice(start, end))
      const vSlices = session.values[0].map((row) => row.slice(start, end))
      const scores = kSlices.map((keySlice) => {
        let total = 0
        for (let index = 0; index < config.headDim; index += 1) {
          total += qSlice[index] * keySlice[index]
        }
        return total / Math.sqrt(config.headDim)
      })
      const weights = softmax(scores)
      const mixedValue = new Array<number>(config.headDim).fill(0)

      for (let positionIndex = 0; positionIndex < vSlices.length; positionIndex += 1) {
        for (let dim = 0; dim < config.headDim; dim += 1) {
          mixedValue[dim] += weights[positionIndex] * vSlices[positionIndex][dim]
        }
      }

      mixedValue.forEach((value, index) => {
        concatenated[start + index] = value
      })

      heads.push({
        q: qSlice,
        kSlices,
        vSlices,
        scores,
        weights,
        mixedValue,
      })
    }

    const attnOutput = linear(concatenated, bundle.weights['layer0.attn_wo'])
    const xAfterAttnResidual = addVectors(attnOutput, xAfterNorm)
    const mlpInput = rmsnorm(xAfterAttnResidual)
    const mlpHidden = relu(linear(mlpInput, bundle.weights['layer0.mlp_fc1']))
    const mlpOutput = linear(mlpHidden, bundle.weights['layer0.mlp_fc2'])
    const xAfterMlpResidual = addVectors(mlpOutput, xAfterAttnResidual)
    const logits = linear(xAfterMlpResidual, bundle.weights.lm_head)
    const probs = softmax(
      logits.map((value) => value / bundle.sampling.temperature),
    )

    const rng = new SeededRandom(session.sampleState)
    const sampledTokenId = rng.nextWeightedIndex(probs)
    session.sampleState = rng.snapshot()

    const trace: TokenStepTrace = {
      tokenId: session.currentTokenId,
      positionId: session.position,
      tokenEmbedding,
      positionEmbedding,
      xAfterEmbed,
      xAfterNorm,
      heads,
      attnOutput,
      xAfterAttnResidual,
      mlpHidden,
      mlpOutput,
      xAfterMlpResidual,
      logits,
      probs,
      sampledTokenId,
      topCandidates: topCandidates(probs, bundle.vocab),
    }

    if (
      sampledTokenId === config.bosToken ||
      session.position + 1 >= config.blockSize
    ) {
      session.done = true
      session.doneReason =
        sampledTokenId === config.bosToken ? 'bos' : 'context'
    } else {
      session.generatedTokenIds.push(sampledTokenId)
      session.visibleTokenIds.push(sampledTokenId)
      session.contextTokenIds.push(sampledTokenId)
      session.currentTokenId = sampledTokenId
      session.position += 1
    }

    return trace
  }

  dispose() {}

  private appendToCache(session: SessionState, tokenId: number, positionId: number) {
    const bundle = this.requireBundle()
    const tokenEmbedding = matrixRow(bundle.weights.wte, tokenId)
    const positionEmbedding = matrixRow(bundle.weights.wpe, positionId)
    const xAfterEmbed = addVectors(tokenEmbedding, positionEmbedding)
    const xAfterNorm = rmsnorm(xAfterEmbed)
    const attnInput = rmsnorm(xAfterNorm)
    session.keys[0].push(linear(attnInput, bundle.weights['layer0.attn_wk']))
    session.values[0].push(linear(attnInput, bundle.weights['layer0.attn_wv']))
  }

  private requireBundle() {
    if (!this.bundle) {
      throw new Error('CPU engine not initialized')
    }
    return this.bundle
  }
}
