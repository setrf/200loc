import { describe, expect, it } from 'vitest'
import {
  computeModelCardLayout,
  computeModelCardVisibility,
  computeModelCardVisibilityFromDelta,
} from '../vendor/llmVizOriginal/llm/components/ModelCard'
import { siteMicroVizTheme } from '../viz/microViz/theme'

describe('model card layout', () => {
  it('grows to fit longer content while keeping text inside the card', () => {
    const compact = computeModelCardLayout(5, 8, 4)
    const wide = computeModelCardLayout(12, 14, 8)
    const scale = siteMicroVizTheme.typography.scale

    expect(wide.br.x - wide.tl.x).toBeGreaterThanOrEqual(compact.br.x - compact.tl.x)
    expect(compact.titleFontScale).toBeLessThanOrEqual(scale.xl)
    expect(compact.titleFontScale).toBeGreaterThanOrEqual(scale.lg)
    expect(wide.titleFontScale).toBeLessThanOrEqual(compact.titleFontScale)
    expect(wide.titleFontScale).toBeGreaterThanOrEqual(scale.lg)
    expect(wide.paramLabelScale).toBeLessThanOrEqual(scale.sm)
    expect(wide.paramValueScale).toBeLessThanOrEqual(scale.md)
  })

  it('keeps a readable minimum size for very long strings', () => {
    const layout = computeModelCardLayout(40, 30, 18)
    const scale = siteMicroVizTheme.typography.scale

    expect(layout.titleFontScale).toBeGreaterThanOrEqual(scale.lg)
    expect(layout.paramLabelScale).toBeGreaterThanOrEqual(scale.xs)
    expect(layout.paramValueScale).toBeGreaterThanOrEqual(scale.sm)
    expect(layout.br.x - layout.tl.x).toBeLessThanOrEqual(102)
  })

  it('keeps the overview card visible as manual zoom moves into the model', () => {
    const full = computeModelCardVisibility(11.2, 11.2)
    const mid = computeModelCardVisibility(8, 11.2)
    const close = computeModelCardVisibility(6.16, 11.2)

    expect(full.opacity).toBe(1)
    expect(full.scale).toBe(1)
    expect(mid.opacity).toBe(1)
    expect(mid.scale).toBe(1)
    expect(close.opacity).toBe(1)
    expect(close.scale).toBe(1)
  })

  it('keeps the overview card visible when the camera moves away from the overview shot', () => {
    const panned = computeModelCardVisibilityFromDelta(11.2, 11.2, 60, 0)
    const rotated = computeModelCardVisibilityFromDelta(11.2, 11.2, 0, 24)

    expect(panned.opacity).toBe(1)
    expect(rotated.opacity).toBe(1)
  })
})
