import { describe, expect, it, vi } from 'vitest'
import { loadModelBundle, resolveAssetPath } from '../model'
import type { ModelBundleJson } from '../model'
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

function mockBundleFetch(bundle: ModelBundleJson) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => bundle,
  } as Response)
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

  it('resolves asset paths against the Vite base URL', () => {
    expect(resolveAssetPath('/assets/microgpt-model.json')).toBe('/assets/microgpt-model.json')
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

  it.each([
    [
      'positive vocab size',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.vocabSize = 0
      },
      'Invalid model bundle: config.vocabSize must be a positive integer',
    ],
    [
      'positive layer count',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.nLayer = 0
      },
      'Invalid model bundle: config.nLayer must be a positive integer',
    ],
    [
      'positive embedding width',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.nEmbd = 0
      },
      'Invalid model bundle: config.nEmbd must be a positive integer',
    ],
    [
      'positive head count',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.nHead = 0
      },
      'Invalid model bundle: config.nHead must be a positive integer',
    ],
    [
      'positive head dimension',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.headDim = 0
      },
      'Invalid model bundle: config.headDim must be a positive integer',
    ],
    [
      'minimum block size',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.blockSize = 1
      },
      'Invalid model bundle: config.blockSize must be an integer greater than 1',
    ],
    [
      'non-negative bos token',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.bosToken = -1
      },
      'Invalid model bundle: config.bosToken must be a non-negative integer',
    ],
    [
      'vocab size consistency',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.vocabSize += 1
      },
      'Invalid model bundle: config.vocabSize must match vocab length (28 !== 27)',
    ],
    [
      'bos token within vocab',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.bosToken = bundle.config.vocabSize
      },
      'Invalid model bundle: config.bosToken must reference a token inside the vocabulary',
    ],
    [
      'headDim consistency',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.headDim = bundle.config.headDim + 1
      },
      'Invalid model bundle: config.headDim * config.nHead must equal config.nEmbd',
    ],
    [
      'single layer support',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.config.nLayer = 2
      },
      'Invalid model bundle: 200loc only supports bundles with exactly one transformer layer',
    ],
    [
      'positive temperature',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.sampling.temperature = 0
      },
      'Invalid model bundle: sampling.temperature must be a positive finite number',
    ],
    [
      'integer sampling seed',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.sampling.seed = 1.5
      },
      'Invalid model bundle: sampling.seed must be an integer',
    ],
    [
      'string vocab entries',
      (bundle: ReturnType<typeof bundleJson>) => {
        ;(bundle.vocab as unknown as unknown[])[0] = 7
      },
      'Invalid model bundle: vocab entries must all be strings',
    ],
    [
      'weight shape',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.weights.wte.rows -= 1
      },
      'Invalid model bundle: "wte" must have shape 27x16, received 26x16',
    ],
    [
      'weight data length',
      (bundle: ReturnType<typeof bundleJson>) => {
        bundle.weights.wte.data = bundle.weights.wte.data.slice(0, -1)
      },
      'Invalid model bundle: "wte" data length must be 432, received 431',
    ],
  ])('rejects invalid bundles for %s', async (_label, mutate, message) => {
    const invalidBundle = bundleJson()
    mutate(invalidBundle)

    const fetchMock = mockBundleFetch(invalidBundle)
    await expect(loadModelBundle('/invalid-case.json')).rejects.toThrow(message)
    fetchMock.mockRestore()
  })
})
