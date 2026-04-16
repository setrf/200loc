import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTRO_STORAGE_KEY } from '../intro/storage'
import type { PrefixNormalization } from '../model'
import { loadBundle, makeTrace } from './helpers/fixtures'

const loadModelBundleMock = vi.fn()
const createTokenizerMock = vi.fn()
const runtimeCtorMock = vi.fn()

vi.mock('../model', () => ({
  loadModelBundle: loadModelBundleMock,
  createTokenizer: createTokenizerMock,
  MicrogptRuntime: runtimeCtorMock,
  resolveAssetPath: (path: string) => `/${path.replace(/^\/+/, '')}`,
}))

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

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
    normalizePrefix: vi.fn((value: string): PrefixNormalization => {
      const normalized = value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15)
      return {
        normalized,
        removedUnsupported: normalized !== value.toLowerCase(),
        truncated:
          normalized.length !==
          value.toLowerCase().replace(/[^a-z]/g, '').length,
      }
    }),
    encode: vi.fn((value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .split('')
        .map((char) => char.charCodeAt(0) - 97),
    ),
    decode: vi.fn((tokenIds: readonly number[]) =>
      tokenIds
        .filter((tokenId) => tokenId !== 26)
        .map((tokenId) => String.fromCharCode(tokenId + 97))
        .join(''),
    ),
    tokenLabel: vi.fn((tokenId: number) =>
      tokenId === 26 ? 'BOS' : String(tokenId),
    ),
  }
}

function mockSourceFetch(sourceText: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => sourceText,
  } as Response)
}

async function advanceIntroToFinalStep() {
  for (let index = 0; index < 12; index += 1) {
    fireEvent.click(
      screen.getByRole('button', {
        name: index === 0 ? 'Start tour' : 'Next',
      }),
    )
  }
}

describe('App intro gate', () => {
  const sourceText = Array.from(
    { length: 220 },
    (_, index) => `line ${index + 1}`,
  ).join('\n')
  const bundleStub = loadBundle()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    window.localStorage.clear()
    Object.defineProperty(window, 'requestAnimationFrame', {
      writable: true,
      value: vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 1
      }),
    })
    Object.defineProperty(window, 'cancelAnimationFrame', {
      writable: true,
      value: vi.fn(),
    })
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
    vi.restoreAllMocks()
  })

  it('shows the intro on first visit and lets the user skip into the walkthrough', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [4, 12], done: false },
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

    expect(await screen.findByTestId('intro-shell')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', {
        name: 'Before we talk about the model, let’s get comfortable with the interface.',
      }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start tour' }))
    expect(
      await screen.findByRole('heading', {
        name: 'The interface has three main helpers: Code, Story, and Scene.',
      }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }))

    await screen.findByText('How LLM systems actually work')
    expect(window.localStorage.getItem(INTRO_STORAGE_KEY)).toBe('complete')
    expect(screen.getByRole('button', { name: 'Replay intro' })).toBeInTheDocument()
  })

  it('keeps the final intro CTA disabled until bootstrap finishes', async () => {
    const runtime = makeRuntime()
    const resetDeferred = deferred()
    runtime.reset.mockReturnValue(resetDeferred.promise)

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    await screen.findByTestId('intro-shell')
    await advanceIntroToFinalStep()

    expect(
      screen.getByRole('button', { name: 'Preparing walkthrough…' }),
    ).toBeDisabled()

    await act(async () => {
      resetDeferred.resolve({
        trace: makeTrace(),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
      })
      await resetDeferred.promise
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start the deep walkthrough' }),
      ).toBeEnabled()
    })
  })

  it('replays the intro without clearing the current walkthrough state', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [4, 12], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })

    window.localStorage.setItem(INTRO_STORAGE_KEY, 'complete')
    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    await screen.findByText('How LLM systems actually work')
    expect(screen.getByLabelText('Current text')).toHaveTextContent('em')

    fireEvent.click(screen.getByRole('button', { name: 'Replay intro' }))
    await screen.findByTestId('intro-shell')
    fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }))

    await screen.findByText('How LLM systems actually work')
    expect(screen.getByLabelText('Current text')).toHaveTextContent('em')
  })
})
