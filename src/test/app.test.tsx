import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrefixNormalization } from '../model'
import { makeTrace } from './helpers/fixtures'

const loadModelBundleMock = vi.fn()
const createTokenizerMock = vi.fn()
const runtimeCtorMock = vi.fn()

vi.mock('../model', () => ({
  loadModelBundle: loadModelBundleMock,
  createTokenizer: createTokenizerMock,
  MicrogptRuntime: runtimeCtorMock,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeRuntime() {
  return {
    init: vi.fn().mockResolvedValue({
      activeBackend: 'cpu',
      fallbackReason: 'WebGPU unavailable',
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
        truncated: normalized.length !== value.toLowerCase().replace(/[^a-z]/g, '').length,
      }
    }),
    encode: vi.fn((value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .split('')
        .map((char) => char.charCodeAt(0) - 97),
    ),
    decode: vi.fn(),
    tokenLabel: vi.fn((tokenId: number) => (tokenId === 26 ? 'BOS' : String(tokenId))),
  }
}

function mockSourceFetch(sourceText: string, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    text: async () => sourceText,
  } as Response)
}

describe('App', () => {
  const sourceText = Array.from({ length: 220 }, (_, index) => `line ${index + 1}`).join('\n')

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
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
    vi.doUnmock('../hooks/useAutoplay')
    vi.restoreAllMocks()
  })

  it('loads, renders, and walks through the main UI states', async () => {
    const runtime = makeRuntime()
    const firstTrace = makeTrace({ sampledTokenId: 26 })
    const attentionTrace = makeTrace()
    const logitsTrace = makeTrace()
    const sampleTrace = makeTrace({ sampledTokenId: 26 })

    runtime.reset.mockResolvedValue({
      trace: firstTrace,
      session: { visibleTokenIds: [4, 12], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: 'WebGPU unavailable' },
    })
    runtime.advance
      .mockResolvedValueOnce({
        trace: attentionTrace,
        session: { visibleTokenIds: [4, 12, 8], done: false },
        diagnostics: { activeBackend: 'cpu', fallbackReason: 'WebGPU unavailable' },
      })
      .mockResolvedValueOnce({
        trace: logitsTrace,
        session: { visibleTokenIds: [4, 12, 8, 11], done: false },
        diagnostics: { activeBackend: 'cpu', fallbackReason: 'WebGPU unavailable' },
      })
      .mockResolvedValueOnce({
        trace: sampleTrace,
        session: { visibleTokenIds: [4, 12, 8, 11], done: true },
        diagnostics: { activeBackend: 'cpu', fallbackReason: 'WebGPU unavailable' },
      })

    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => sourceText,
    } as Response)

    const { default: App } = await import('../App')
    render(<App />)

    expect(
      screen.getByText('Loading the model and canonical source…'),
    ).toBeInTheDocument()

    await screen.findByText('A 200-line GPT, explained one operation at a time.')
    expect(screen.getAllByText('CPU fallback')).toHaveLength(2)
    expect(screen.getAllByText('Tokenize Prefix')).toHaveLength(2)
    expect(screen.getByText(/Code lines L23-27, L191-196/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Prefix'), {
      target: { value: 'Em!42' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenLastCalledWith('em')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('Token Embedding')).toHaveLength(2)
    expect(screen.getByText(/Code lines L109/)).toBeInTheDocument()

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Four heads, one causal window')).toBeInTheDocument()

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Top candidates')).toBeInTheDocument()

    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getByText('Sampling')).toBeInTheDocument()
    expect(screen.getByText('BOS means the model emitted the stop token and ends generation.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show' }))
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText('Dataset + Shuffle'))
    expect(document.querySelectorAll('.code-viewer__line.is-active').length).toBeGreaterThan(0)
    fireEvent.mouseLeave(screen.getByText('Dataset + Shuffle'))

    fireEvent.click(screen.getByRole('tab', { name: 'viz' }))
    expect(screen.getByRole('tab', { name: 'viz' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'code' }))
    expect(screen.getByRole('tab', { name: 'code' })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders initialization and advance errors', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })
    runtime.advance.mockRejectedValue(new Error('advance failed'))

    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => sourceText,
    } as Response)

    const { default: App } = await import('../App')
    render(<App />)
    await screen.findByText('A 200-line GPT, explained one operation at a time.')

    for (let index = 0; index < 14; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('advance failed')).toBeInTheDocument()
  })

  it('falls back to the generic advance error message for non-Error rejections', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })
    runtime.advance.mockRejectedValue('advance failed')

    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)
    await screen.findByText('A 200-line GPT, explained one operation at a time.')

    for (let index = 0; index < 14; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('Failed to advance model.')).toBeInTheDocument()
  })

  it('handles bootstrap failures and cleanup cancellation', async () => {
    loadModelBundleMock.mockRejectedValue(new Error('bundle failed'))
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return makeRuntime()
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => sourceText,
    } as Response)

    const { default: App } = await import('../App')
    const first = render(<App />)
    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('bundle failed')).toBeInTheDocument()
    first.unmount()

    const initDeferred = deferred<{ activeBackend: 'cpu'; fallbackReason?: string }>()
    const runtime = makeRuntime()
    runtime.init.mockReturnValue(initDeferred.promise)
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })

    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => sourceText,
    } as Response)

    const second = render(<App />)
    await waitFor(() => {
      expect(runtime.init).toHaveBeenCalled()
    })
    second.unmount()
    initDeferred.resolve({ activeBackend: 'cpu' })
    await Promise.resolve()
    expect(runtime.dispose).toHaveBeenCalled()
  })

  it('covers webgpu rendering and autoplay play/pause', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })
    vi.doMock('../hooks/useAutoplay', () => ({
      useAutoplay: (active: boolean, callback: () => void) => {
        const previousActive = useRef(false)
        const callbackRef = useRef(callback)
        useEffect(() => {
          callbackRef.current = callback
        }, [callback])
        useEffect(() => {
          if (active && !previousActive.current) {
            void callbackRef.current()
          }
          previousActive.current = active
        }, [active])
      },
    }))

    const runtime = makeRuntime()
    runtime.init.mockResolvedValue({
      activeBackend: 'webgpu',
      fallbackReason: undefined,
    })
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [4, 12], done: false },
      diagnostics: { activeBackend: 'webgpu', fallbackReason: undefined },
    })

    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    await screen.findByText('A 200-line GPT, explained one operation at a time.')
    expect(screen.getAllByText('WebGPU')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText('Token Embedding')).toHaveLength(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('appends traces, ignores overlapping advances, and focuses code from viz cards', async () => {
    const runtime = makeRuntime()
    const firstTrace = makeTrace({ sampledTokenId: 26 })
    const secondTrace = makeTrace({ tokenId: 7, positionId: 3, sampledTokenId: 8 })
    const thirdTrace = makeTrace({ tokenId: 8, positionId: 4, sampledTokenId: 9 })
    const firstAdvance = deferred<{
      trace: ReturnType<typeof makeTrace>
      session: { visibleTokenIds: number[]; done: boolean }
      diagnostics: { activeBackend: 'cpu'; fallbackReason?: string }
    }>()

    runtime.reset.mockResolvedValue({
      trace: firstTrace,
      session: { visibleTokenIds: [4, 12], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })
    runtime.advance
      .mockReturnValueOnce(firstAdvance.promise)
      .mockResolvedValueOnce({
        trace: thirdTrace,
        session: { visibleTokenIds: [4, 12, 7, 8], done: false },
        diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
      })

    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)
    await screen.findByText('A 200-line GPT, explained one operation at a time.')

    fireEvent.mouseEnter(screen.getByText('Current token'))
    fireEvent.mouseLeave(screen.getByText('Current token'))
    fireEvent.mouseEnter(screen.getByText('Token, position, residual'))
    fireEvent.mouseLeave(screen.getByText('Token, position, residual'))

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.mouseEnter(screen.getByText('Four heads, one causal window'))
    fireEvent.mouseLeave(screen.getByText('Four heads, one causal window'))

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.mouseEnter(screen.getByText('Update the stream locally'))
    fireEvent.mouseLeave(screen.getByText('Update the stream locally'))

    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.mouseEnter(screen.getByText('Top candidates'))
    fireEvent.mouseLeave(screen.getByText('Top candidates'))

    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.mouseEnter(screen.getByText('Sampling'))
    fireEvent.mouseLeave(screen.getByText('Sampling'))

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(runtime.advance).toHaveBeenCalledTimes(1)

    firstAdvance.resolve({
      trace: secondTrace,
      session: { visibleTokenIds: [4, 12, 7], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })

    await waitFor(() => {
      expect(screen.getByText('position 3')).toBeInTheDocument()
    })

    for (let index = 0; index < 14; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    await waitFor(() => {
      expect(screen.getByText('position 4')).toBeInTheDocument()
    })
    expect(runtime.advance).toHaveBeenCalledTimes(2)
  })

  it('covers fetch failures, non-error bootstrap failures, and cancelled bootstrap branches', async () => {
    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return makeRuntime()
    })
    mockSourceFetch(sourceText, false)

    const { default: App } = await import('../App')
    const fetchFailure = render(<App />)
    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('Failed to load microgpt.py')).toBeInTheDocument()
    fetchFailure.unmount()

    loadModelBundleMock.mockRejectedValue('not-an-error')
    mockSourceFetch(sourceText)
    const nonErrorFailure = render(<App />)
    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('Failed to initialize app.')).toBeInTheDocument()
    nonErrorFailure.unmount()

    const bundleDeferred = deferred<{ vocab: [] }>()
    const sourceDeferred = deferred<string>()
    loadModelBundleMock.mockReturnValue(bundleDeferred.promise)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => sourceDeferred.promise,
    } as Response)
    runtimeCtorMock.mockClear()
    const cancelledBeforeInit = render(<App />)
    cancelledBeforeInit.unmount()
    bundleDeferred.resolve({ vocab: [] })
    sourceDeferred.resolve(sourceText)
    await Promise.resolve()
    expect(runtimeCtorMock).not.toHaveBeenCalled()

    const initDeferred = deferred<{ activeBackend: 'cpu'; fallbackReason?: string }>()
    const runtime = makeRuntime()
    runtime.init.mockReturnValue(initDeferred.promise)
    loadModelBundleMock.mockResolvedValue({ vocab: [] })
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)
    const cancelledWithInitError = render(<App />)
    await waitFor(() => {
      expect(runtime.init).toHaveBeenCalled()
    })
    cancelledWithInitError.unmount()
    initDeferred.reject('ignore me')
    await Promise.resolve()
    expect(runtime.dispose).not.toHaveBeenCalled()
  })
})
