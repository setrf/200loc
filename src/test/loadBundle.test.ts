import { describe, expect, it, vi } from 'vitest'
import { loadModelBundle } from '../model'

describe('loadModelBundle', () => {
  it('hydrates float arrays from fetched JSON', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          config: {
            vocabSize: 2,
            bosToken: 1,
            nLayer: 1,
            nEmbd: 2,
            nHead: 1,
            headDim: 2,
            blockSize: 4,
          },
          vocab: ['a', '<BOS>'],
          weights: {
            wte: { rows: 2, cols: 2, data: [1, 2, 3, 4] },
          },
          sampling: { temperature: 0.5, seed: 42 },
        }),
      } as Response)

    const bundle = await loadModelBundle('/test.json')
    expect(fetchMock).toHaveBeenCalledWith('/test.json')
    expect(bundle.weights.wte.data).toBeInstanceOf(Float32Array)
    expect(Array.from(bundle.weights.wte.data)).toEqual([1, 2, 3, 4])

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
})
