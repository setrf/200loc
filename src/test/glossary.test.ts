import { describe, expect, it } from 'vitest'
import { getGlossaryEntry, glossaryEntries } from '../walkthrough/glossary'
import { inferencePhases } from '../walkthrough/phases'

describe('glossary', () => {
  it('returns known glossary entries', () => {
    const entry = getGlossaryEntry('token-id')

    expect(entry.title).toBe('Token ID')
    expect(entry.body.length).toBeGreaterThan(0)
  })

  it('resolves every glossary reference used in inference copy', () => {
    const glossaryIds = new Set(Object.keys(glossaryEntries))

    for (const phase of inferencePhases) {
      for (const beat of phase.copy.beats) {
        for (const segment of beat.segments) {
          if (segment.kind === 'term') {
            expect(glossaryIds.has(segment.glossaryId)).toBe(true)
            expect(getGlossaryEntry(segment.glossaryId).title.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})
