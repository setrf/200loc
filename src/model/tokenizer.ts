import type { ModelBundle, PrefixNormalization } from './types'

export interface Tokenizer {
  bosToken: number
  blockSize: number
  encode: (value: string) => number[]
  decode: (tokenIds: readonly number[]) => string
  tokenLabel: (tokenId: number) => string
  normalizePrefix: (value: string) => PrefixNormalization
}

export function createTokenizer(bundle: ModelBundle): Tokenizer {
  const { vocab, config } = bundle
  const lookup = new Map<string, number>()

  vocab.forEach((token, index) => {
    if (token !== '<BOS>') {
      lookup.set(token, index)
    }
  })

  const normalizePrefix = (value: string): PrefixNormalization => {
    const lowered = value.toLowerCase()
    const filtered = [...lowered].filter((char) => lookup.has(char)).join('')
    const normalized = filtered.slice(0, config.blockSize - 1)
    return {
      normalized,
      removedUnsupported: filtered !== lowered,
      truncated: normalized.length !== filtered.length,
    }
  }

  const encode = (value: string) => {
    const { normalized } = normalizePrefix(value)
    return [...normalized].map((char) => lookup.get(char)!)
  }

  const decode = (tokenIds: readonly number[]) =>
    tokenIds
      .filter((tokenId) => tokenId !== config.bosToken)
      .map((tokenId) => vocab[tokenId] ?? '')
      .join('')

  const tokenLabel = (tokenId: number) =>
    tokenId === config.bosToken ? 'BOS' : (vocab[tokenId] ?? '?')

  return {
    bosToken: config.bosToken,
    blockSize: config.blockSize,
    encode,
    decode,
    tokenLabel,
    normalizePrefix,
  }
}
