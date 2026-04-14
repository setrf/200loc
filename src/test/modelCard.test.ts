import { describe, expect, it } from 'vitest'
import { computeModelCardLayout } from '../vendor/llmVizOriginal/llm/components/ModelCard'

describe('model card layout', () => {
  it('grows to fit longer content while keeping text inside the card', () => {
    const compact = computeModelCardLayout(5, 8, 4)
    const wide = computeModelCardLayout(12, 14, 8)

    expect(wide.br.x - wide.tl.x).toBeGreaterThan(compact.br.x - compact.tl.x)
    expect(wide.titleFontScale).toBeLessThanOrEqual(13)
    expect(wide.paramLabelScale).toBeLessThanOrEqual(4)
    expect(wide.paramValueScale).toBeLessThanOrEqual(8)
  })

  it('keeps a readable minimum size for very long strings', () => {
    const layout = computeModelCardLayout(40, 30, 18)

    expect(layout.titleFontScale).toBeGreaterThanOrEqual(9)
    expect(layout.paramLabelScale).toBeGreaterThanOrEqual(3.2)
    expect(layout.paramValueScale).toBeGreaterThanOrEqual(6.4)
    expect(layout.br.x - layout.tl.x).toBeLessThanOrEqual(102)
  })
})
