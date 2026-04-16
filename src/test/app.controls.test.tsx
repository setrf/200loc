import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTRO_STORAGE_KEY } from '../intro/storage'
import type { PrefixNormalization } from '../model'
import { inferencePhases } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

const loadModelBundleMock = vi.fn()
const createTokenizerMock = vi.fn()
const runtimeCtorMock = vi.fn()
const firstBeat = inferencePhases[0]!.copy.beats[0]!.segments
  .map((segment) => segment.text)
  .join('')

vi.mock('../model', () => ({
  loadModelBundle: loadModelBundleMock,
  createTokenizer: createTokenizerMock,
  MicrogptRuntime: runtimeCtorMock,
  resolveAssetPath: (path: string) => `/${path.replace(/^\/+/, '')}`,
}))

vi.mock('../components/Controls', () => ({
  Controls: ({
    beats,
  }: {
    beats: { segments: { text: string }[] }[]
  }) => (
    <div>
      <span>{beats[0]?.segments.map((segment) => segment.text).join('')}</span>
    </div>
  ),
}))

function makeRuntime() {
  return {
    init: vi.fn().mockResolvedValue({
      activeBackend: 'cpu',
      fallbackReason: undefined,
    }),
    reset: vi.fn(),
    advance: vi.fn(),
    dispose: vi.fn(),
  }
}

function makeTokenizer() {
  return {
    normalizePrefix: vi.fn((value: string): PrefixNormalization => ({
      normalized: value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15),
      removedUnsupported: false,
      truncated: false,
    })),
    encode: vi.fn(() => []),
    decode: vi.fn(),
    tokenLabel: vi.fn((tokenId: number) => (tokenId === 26 ? 'BOS' : String(tokenId))),
  }
}

function mockSourceFetch(sourceText: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => sourceText,
  } as Response)
}

describe('App forced control branches', () => {
  const sourceText = Array.from({ length: 220 }, (_, index) => `line ${index + 1}`).join('\n')
  const bundleStub = loadBundle()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    window.localStorage.setItem(INTRO_STORAGE_KEY, 'complete')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })
  })

  afterEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('covers the prev callback wiring', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    await screen.findAllByText(firstBeat)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
    })

    expect(runtime.advance).not.toHaveBeenCalled()
  })

  it(
    'covers the terminal play-toggle guard',
    async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [], done: true },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    await screen.findAllByText(firstBeat)

    for (let index = 0; index < 33; index += 1) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Next' }))
      })
    }

    await screen.findByText('Append Or Stop')

    expect(runtime.advance).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })

    expect(runtime.advance).not.toHaveBeenCalled()
    },
    15000,
  )
})
