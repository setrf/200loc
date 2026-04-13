import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ModelBundle, ModelBundleJson, TokenStepTrace } from '../../model'

export function loadBundle(): ModelBundle {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/assets/microgpt-model.json'), 'utf8'),
  ) as ModelBundleJson

  return {
    ...raw,
    weights: Object.fromEntries(
      Object.entries(raw.weights).map(([name, matrix]) => [
        name,
        { ...matrix, data: Float32Array.from(matrix.data) },
      ]),
    ),
  }
}

export function loadTraceFixture() {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), 'src/test/fixtures/expected-step-em.json'), 'utf8'),
  ) as TokenStepTrace & { prefix: string }
}

export function makeTrace(
  overrides: Partial<TokenStepTrace> = {},
): TokenStepTrace {
  const trace = loadTraceFixture()
  return {
    tokenId: trace.tokenId,
    positionId: trace.positionId,
    tokenEmbedding: trace.tokenEmbedding,
    positionEmbedding: trace.positionEmbedding,
    xAfterEmbed: trace.xAfterEmbed,
    xAfterNorm: trace.xAfterNorm,
    heads: trace.heads,
    attnOutput: trace.attnOutput,
    xAfterAttnResidual: trace.xAfterAttnResidual,
    mlpHidden: trace.mlpHidden,
    mlpOutput: trace.mlpOutput,
    xAfterMlpResidual: trace.xAfterMlpResidual,
    logits: trace.logits,
    probs: trace.probs,
    sampledTokenId: trace.sampledTokenId,
    topCandidates: trace.topCandidates,
    ...overrides,
  }
}
