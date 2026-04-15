import { describe, expect, it } from 'vitest'
import {
  normalizePrefixFallback,
  normalizePrefixInput,
} from '../prefixNormalization'

describe('normalizePrefixFallback', () => {
  it('normalizes letters, strips unsupported chars, and caps length', () => {
    expect(normalizePrefixFallback('Em-12??')).toEqual({
      normalized: 'em',
      removedUnsupported: true,
      truncated: false,
    })

    expect(normalizePrefixFallback('abcdefghijklmnopqrstuvwxyz')).toEqual({
      normalized: 'abcdefghijklmno',
      removedUnsupported: false,
      truncated: true,
    })
  })

  it('uses the tokenizer path when one is available', () => {
    const tokenizer = {
      normalizePrefix: (value: string) => ({
        normalized: `${value}!`,
        removedUnsupported: false,
        truncated: false,
      }),
    }

    expect(normalizePrefixInput(tokenizer, 'em')).toEqual({
      normalized: 'em!',
      removedUnsupported: false,
      truncated: false,
    })
    expect(normalizePrefixInput(null, 'Em-12??')).toEqual({
      normalized: 'em',
      removedUnsupported: true,
      truncated: false,
    })
  })
})
