import { describe, expect, it, vi } from 'vitest'
import { loadModelBundle } from '../model'
import { loadBundle as loadFixtureBundle } from './helpers/fixtures'

function bundleJson() {
  const bundle = loadFixtureBundle()
  return {
    ...bundle,
    weights: Object.fromEntries(
      Object.entries(bundle.weights).map(([name, matrix]) => [
        name,
        {
          rows: matrix.rows,
          cols: matrix.cols,
          data: Array.from(matrix.data),
        },
      ]),
    ),
  }
}

describe('loadModelBundle', () => {
  it('hydrates float arrays from fetched JSON', async () => {
    const fixture = bundleJson()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fixture,
      } as Response)

    const bundle = await loadModelBundle('/test.json')
    expect(fetchMock).toHaveBeenCalledWith('/test.json')
    expect(bundle.weights.wte.data).toBeInstanceOf(Float32Array)
    expect(Array.from(bundle.weights.wte.data)).toEqual(fixture.weights.wte.data)

    fetchMock.mockRestore()
  })

  it('throws when the bundle request fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)

    await expect(loadModelBundle()).rejects.toThrow(
      'Failed to load model bundle: 500',
    )

    fetchMock.mockRestore()
  })

  it('validates supported bundle structure before hydrating', async () => {
    const invalidBundle = bundleJson()
    invalidBundle.config.nHead = 2
    invalidBundle.config.headDim = invalidBundle.config.nEmbd / 2

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => invalidBundle,
      } as Response)

    await expect(loadModelBundle('/invalid.json')).rejects.toThrow(
      'Invalid model bundle: 200loc only supports bundles with exactly four attention heads',
    )

    fetchMock.mockRestore()
  })

  it('rejects bundles with missing or malformed weights', async () => {
    const invalidBundle = bundleJson()
    delete invalidBundle.weights['layer0.attn_wq']

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => invalidBundle,
      } as Response)

    await expect(loadModelBundle('/invalid-weights.json')).rejects.toThrow(
      'Invalid model bundle: missing required weight "layer0.attn_wq"',
    )

    fetchMock.mockRestore()
  })
})
