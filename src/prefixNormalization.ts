import type { PrefixNormalization } from './model'

type PrefixNormalizer = {
  normalizePrefix: (value: string) => PrefixNormalization
}

// Keep prefix input usable before the model bundle and tokenizer are ready.
export function normalizePrefixFallback(value: string): PrefixNormalization {
  const lowered = value.toLowerCase()
  const lettersOnly = lowered.replace(/[^a-z]/g, '')

  return {
    normalized: lettersOnly.slice(0, 15),
    removedUnsupported: /[^a-z]/.test(lowered),
    truncated: lettersOnly.length > 15,
  }
}

export function normalizePrefixInput(
  tokenizer: PrefixNormalizer | null,
  value: string,
): PrefixNormalization {
  if (tokenizer) {
    return tokenizer.normalizePrefix(value)
  }

  return normalizePrefixFallback(value)
}
