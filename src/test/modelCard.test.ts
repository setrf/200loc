import { describe, expect, it } from 'vitest'
import {
  computeModelCardLayout,
  computeModelCardVisibility,
  computeModelCardVisibilityFromDelta,
} from '../vendor/llmVizOriginal/llm/components/ModelCard'

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

  it('fades the overview card as manual zoom moves into the model', () => {
    const full = computeModelCardVisibility(11.2, 11.2)
    const mid = computeModelCardVisibility(8, 11.2)
    const hidden = computeModelCardVisibility(6.16, 11.2)

    expect(full.opacity).toBe(1)
    expect(full.scale).toBe(1)
    expect(mid.opacity).toBeGreaterThan(0)
    expect(mid.opacity).toBeLessThan(1)
    expect(hidden.opacity).toBe(0)
    expect(hidden.scale).toBeLessThan(1)
  })

  it('also fades the overview card when the camera moves away from the overview shot', () => {
    const panned = computeModelCardVisibilityFromDelta(11.2, 11.2, 60, 0)
    const rotated = computeModelCardVisibilityFromDelta(11.2, 11.2, 0, 24)

    expect(panned.opacity).toBe(0)
    expect(rotated.opacity).toBe(0)
  })
})
