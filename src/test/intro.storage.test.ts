import { describe, expect, it } from 'vitest'
import {
  INTRO_STORAGE_KEY,
  readIntroCompletion,
  writeIntroCompletion,
} from '../intro/storage'

describe('intro storage', () => {
  it('reads and writes completion state', () => {
    expect(readIntroCompletion()).toBe(false)

    writeIntroCompletion(true)
    expect(window.localStorage.getItem(INTRO_STORAGE_KEY)).toBe('complete')
    expect(readIntroCompletion()).toBe(true)

    writeIntroCompletion(false)
    expect(window.localStorage.getItem(INTRO_STORAGE_KEY)).toBeNull()
    expect(readIntroCompletion()).toBe(false)
  })
})
