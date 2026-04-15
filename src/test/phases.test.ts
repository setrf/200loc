import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTensorWindow } from '../viz/llmViz/frame'
import { inferencePhases, trainingAppendix, vizFocusRanges } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

describe('phase line maps', () => {
  const bundle = loadBundle()
  const tokenLabel = (tokenId: number) => (tokenId === 26 ? 'BOS' : String(tokenId))

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

  it('gives every phase grouped viz metadata and explanation copy', () => {
    const baseTrace = makeTrace()
    const terminalTrace = makeTrace({ sampledTokenId: 26 })
    const tokenLabel = (tokenId: number) => (tokenId === 26 ? 'BOS' : String(tokenId))

    const explanationBodies = inferencePhases.map((phase, index) => {
      const trace = index === inferencePhases.length - 1 ? terminalTrace : baseTrace
      expect(phase.select(trace)).toBeDefined()
      expect(phase.viz.focusNodeId).toBeDefined()
      expect(phase.viz.cameraPoseId).toBeDefined()
      expect(phase.viz.overlayKind).toBeDefined()
      expect(vizFocusRanges[phase.viz.focusNodeId].length).toBeGreaterThan(0)
      expect(phase.explanationTitle(trace, tokenLabel).length).toBeGreaterThan(0)
      expect(phase.explanationWhy(trace, tokenLabel).length).toBeGreaterThan(0)
      return phase.explanationBody(trace, tokenLabel)
    })

    expect(explanationBodies).toHaveLength(inferencePhases.length)
    expect(explanationBodies[0]).toContain('current slot')
    expect(explanationBodies.at(-1)).toContain('Generation ends')
    expect(trainingAppendix.every((section) => section.description.length > 0)).toBe(true)
  })

  it('falls back to the context window for unknown phases', () => {
    const window = buildTensorWindow(
      makeTrace(),
      { ...inferencePhases[0]!, id: 'unknown-phase' } as typeof inferencePhases[number],
      bundle,
      ['BOS', 'e', 'm'],
      tokenLabel,
    )

    expect(window.id).toBe('context-window')
    expect(window.anchorNodeId).toBe('context')
  })
})
