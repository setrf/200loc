import type { ModelBundle } from '../model'

export interface ModelIdentity {
  summary: string
  detail: string
}

export function buildModelIdentity(bundle: ModelBundle): ModelIdentity {
  const { training } = bundle
  const trainingDocs = training?.docs.toLocaleString('en-US') ?? '32,033'

  return {
    summary: `microgpt · browser-local · ${trainingDocs} lowercase names · one character at a time`,
    detail: `Start with a few lowercase letters, then step through one next-character prediction.`,
  }
}
