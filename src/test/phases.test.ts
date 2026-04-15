import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTensorWindow } from '../viz/llmViz/frame'
import { getGlossaryEntry } from '../walkthrough/glossary'
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
    const summaries = inferencePhases.map((phase) => {
      const trace = phase.id === 'append-or-stop'
        ? makeTrace({ sampledTokenId: 26 })
        : baseTrace
      expect(phase.select(trace)).toBeDefined()
      expect(phase.groupTitle.length).toBeGreaterThan(0)
      expect(phase.stepTitle.length).toBeGreaterThan(0)
      expect(phase.stepId.length).toBeGreaterThan(0)
      expect(phase.stepIndexWithinGroup).toBeGreaterThanOrEqual(1)
      expect(phase.stepIndexWithinGroup).toBeLessThanOrEqual(phase.stepCountWithinGroup)
      expect(phase.viz.focusNodeId).toBeDefined()
      expect(phase.viz.cameraPoseId).toBeDefined()
      expect(phase.viz.overlayKind).toBeDefined()
      expect(vizFocusRanges[phase.viz.focusNodeId].length).toBeGreaterThan(0)
      expect(phase.copy.beats.length).toBeGreaterThan(0)
      expect(phase.copy.beats[0]?.kind).toBe('core')
      expect(phase.copy.beats.every((beat) => beat.segments.length > 0)).toBe(true)
      expect(phase.copy.beats.some((beat) => beat.kind === 'scene')).toBe(true)
      expect(phase.copy.beats.some((beat) => beat.kind === 'code')).toBe(true)
      expect(
        phase.copy.beats
          .flatMap((beat) => beat.segments)
          .filter((segment) => segment.kind === 'term')
          .every((segment) => getGlossaryEntry(segment.glossaryId).title.length > 0),
      ).toBe(true)
      expect(phase.sceneCopy.windowTitle.length).toBeGreaterThan(0)
      expect(phase.sceneCopy.windowSubtitle.length).toBeGreaterThan(0)
      return phase.copy.beats[0]?.segments.map((segment) => segment.text).join('') ?? ''
    })

    const groupCounts = Object.fromEntries(
      Array.from(new Set(inferencePhases.map((phase) => phase.groupId))).map((groupId) => [
        groupId,
        inferencePhases.filter((phase) => phase.groupId === groupId).length,
      ]),
    )

    expect(summaries).toHaveLength(34)
    expect(summaries[0]).toContain('small piece of text')
    expect(summaries.at(-1)).toContain('loops back')
    expect(groupCounts).toEqual({
      tokenize: 3,
      'token-embedding': 2,
      'position-embedding': 2,
      'embed-add-norm': 2,
      qkv: 4,
      'attention-scores': 2,
      'attention-softmax': 2,
      'weighted-values': 2,
      'attn-out': 3,
      mlp: 4,
      'lm-head': 2,
      probabilities: 2,
      sample: 2,
      'append-or-stop': 2,
    })
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
