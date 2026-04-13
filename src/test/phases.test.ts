import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inferencePhases, trainingAppendix } from '../walkthrough/phases'
import { makeTrace } from './helpers/fixtures'

describe('phase line maps', () => {
  it('stay within the canonical source file', () => {
    const lineCount = readFileSync(
      resolve(process.cwd(), 'public/assets/microgpt.py'),
      'utf8',
    ).split('\n').length

    for (const range of [...inferencePhases, ...trainingAppendix].flatMap((item) => item.codeRanges)) {
      expect(range.start).toBeGreaterThanOrEqual(1)
      expect(range.end).toBeGreaterThanOrEqual(range.start)
      expect(range.end).toBeLessThanOrEqual(lineCount)
    }
  })

  it('executes every phase selector and narration branch', () => {
    const baseTrace = makeTrace()
    const terminalTrace = makeTrace({ sampledTokenId: 26 })

    const narrationBodies = inferencePhases.map((phase, index) => {
      const trace = index === inferencePhases.length - 1 ? terminalTrace : baseTrace
      expect(phase.select(trace)).toBeDefined()
      return phase.narration(trace, (tokenId) =>
        tokenId === 26 ? 'BOS' : String(tokenId),
      )
    })

    expect(narrationBodies).toHaveLength(inferencePhases.length)
    expect(narrationBodies[0].lead).toContain('position')
    expect(narrationBodies.at(-1)?.lead).toContain('stops')
    expect(trainingAppendix.every((section) => section.description.length > 0)).toBe(true)
  })
})
