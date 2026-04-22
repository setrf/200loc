import type { ModelBundle } from '../model'

export interface ModelIdentity {
  summary: string
  detail: string
}

export function buildModelIdentity(bundle: ModelBundle): ModelIdentity {
  const { config, training } = bundle
  const trainingDocs = training?.docs.toLocaleString('en-US') ?? '32,033'

  return {
    summary: `${trainingDocs} lowercase names -> one character at a time`,
    detail: `microgpt - browser-local - ${config.nLayer} layer - ${config.nHead} attention heads - ${config.nEmbd}-wide vectors - ${config.blockSize}-character context`,
  }
}
