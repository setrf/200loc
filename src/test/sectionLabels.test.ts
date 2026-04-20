import { describe, expect, it } from 'vitest'
import {
  resolveSectionHeadIndex,
  resolveSectionLabelOpacity,
} from '../vendor/llmVizOriginal/llm/components/SectionLabels'

function head(overrides: Record<string, unknown> = {}) {
  return {
    headLabel: { visible: 0.62 },
    qLabel: { visible: 0.7 },
    kLabel: { visible: 0.7 },
    vLabel: { visible: 0.7 },
    mtxLabel: { visible: 0.6 },
    vectorLabel: { visible: 0.6 },
    ...overrides,
  }
}

describe('section label semantics', () => {
  it('prefers the active walkthrough head when one is provided', () => {
    const block = {
      heads: [
        head(),
        head(),
        head(),
        head({ headLabel: { visible: 1 } }),
      ],
    }

    expect(resolveSectionHeadIndex(block as never, 2)).toBe(2)
  })

  it('falls back to the most visible head and breaks ties toward the front-most label set', () => {
    const block = {
      heads: [
        head({ headLabel: { visible: 0.3 } }),
        head(),
        head(),
        head(),
      ],
    }

    expect(resolveSectionHeadIndex(block as never, null)).toBe(3)
  })

  it('tracks walkthrough visibility without forcing a bright minimum alpha', () => {
    expect(resolveSectionLabelOpacity(0)).toBe(0)
    expect(resolveSectionLabelOpacity(0.18)).toBe(0.18)
    expect(resolveSectionLabelOpacity(0.72)).toBe(0.72)
    expect(resolveSectionLabelOpacity(1.4)).toBe(1)
  })
})
