import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrefixNormalization } from '../model'
import { loadBundle, makeTrace } from './helpers/fixtures'

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
    decode: vi.fn(),
    tokenLabel: vi.fn((tokenId: number) =>
      tokenId === 26 ? 'BOS' : String(tokenId),
    ),
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
  const sourceText = Array.from(
    { length: 220 },
    (_, index) => `line ${index + 1}`,
  ).join('\n')
  const bundleStub = loadBundle()

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
    Object.defineProperty(window, 'CSS', {
      writable: true,
      value: {
        supports: vi.fn().mockReturnValue(false),
      },
    })
  })

  afterEach(() => {
    vi.doUnmock('../hooks/useAutoplay')
    vi.restoreAllMocks()
  })

  it(
    'loads, renders the simplified walkthrough, and advances through phases',
    async () => {
    const runtime = makeRuntime()
    const firstTrace = makeTrace({ sampledTokenId: 26 })
    const attentionTrace = makeTrace()
    const logitsTrace = makeTrace()
    const sampleTrace = makeTrace({ sampledTokenId: 26 })

    runtime.reset.mockResolvedValue({
      trace: firstTrace,
      session: { visibleTokenIds: [4, 12], done: false },
      diagnostics: {
        activeBackend: 'cpu',
        fallbackReason: 'WebGPU unavailable',
      },
    })
    runtime.advance
      .mockResolvedValueOnce({
        trace: attentionTrace,
        session: { visibleTokenIds: [4, 12, 8], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockResolvedValueOnce({
        trace: logitsTrace,
        session: { visibleTokenIds: [4, 12, 8, 11], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockResolvedValueOnce({
        trace: sampleTrace,
        session: { visibleTokenIds: [4, 12, 8, 11], done: true },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    expect(
      screen.getByText('Loading the model and canonical source…'),
    ).toBeInTheDocument()

    await screen.findByText('How a tiny GPT predicts the next token')
    expect(screen.getByText('Original llm-viz')).toBeInTheDocument()
    expect(screen.getAllByText('microgpt').length).toBeGreaterThan(0)
    expect(screen.getAllByText('CPU fallback').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tokenize Prefix').length).toBeGreaterThan(0)
    expect(screen.getByText('Original llm-viz')).toBeInTheDocument()
    expect(screen.getByTestId('vendored-layer-view')).toBeInTheDocument()
    expect(screen.getAllByText('p2:12 -> p3:stop').length).toBeGreaterThan(0)
    expect(screen.getByText('line 117').closest('li')).not.toHaveClass('is-active')

    fireEvent.mouseEnter(screen.getAllByText('step 1 / 14')[0])
    expect(screen.getByText('line 23').closest('li')).toHaveClass('is-active')
    fireEvent.mouseLeave(screen.getAllByText('step 1 / 14')[0])
    fireEvent.mouseEnter(screen.getByLabelText('Architecture scene'))
    expect(document.querySelectorAll('.code-viewer__line.is-active').length).toBeGreaterThan(0)
    fireEvent.mouseLeave(screen.getByLabelText('Architecture scene'))

    fireEvent.change(screen.getByLabelText('Prefix'), {
      target: { value: 'Em!42' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenLastCalledWith('em')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getAllByText('Token Embedding').length).toBeGreaterThan(0)
    expect(screen.getByText('Look up the row for 12')).toBeInTheDocument()

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(
      screen.getByText('Normalize the read weights for p2'),
    ).toBeInTheDocument()

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(
      screen.getByText('Normalize the next-token distribution for p3'),
    ).toBeInTheDocument()

    for (let index = 0; index < 2; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(screen.getAllByText('Append Or Stop').length).toBeGreaterThan(0)
    expect(screen.getByText('Stop generation on BOS')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show training note' }))
    expect(screen.getByRole('button', { name: 'Hide training note' })).toBeInTheDocument()
    expect(screen.getByText('Dataset + Shuffle')).toBeInTheDocument()

    fireEvent.mouseEnter(screen.getByText('Dataset + Shuffle'))
    expect(document.querySelectorAll('.code-viewer__line.is-active').length).toBeGreaterThan(0)
    fireEvent.mouseLeave(screen.getByText('Dataset + Shuffle'))

    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }))
    expect(screen.getByRole('tab', { name: 'Scene' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Code' }))
    expect(screen.getByRole('tab', { name: 'Code' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    },
    20000,
  )

  it(
    'renders initialization and advance errors',
    async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })
    runtime.advance.mockRejectedValue(new Error('advance failed'))

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)
    await screen.findByText('How a tiny GPT predicts the next token')

    for (let index = 0; index < 14; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('advance failed')).toBeInTheDocument()
    },
    15000,
  )

  it('renders the BOS-only context path at position zero', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ tokenId: 26, positionId: 0, sampledTokenId: 26 }),
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

    await screen.findByText('How a tiny GPT predicts the next token')
    expect(screen.getAllByText('p0:BOS -> p1:stop').length).toBeGreaterThan(0)
    expect(screen.getByText('Stand on p0:BOS')).toBeInTheDocument()
  })

  it('falls back to the generic advance error message for non-Error rejections', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [], done: false },
      diagnostics: { activeBackend: 'cpu', fallbackReason: undefined },
    })
    runtime.advance.mockRejectedValue('advance failed')

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)
    await screen.findByText('How a tiny GPT predicts the next token')

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
    mockSourceFetch(sourceText)

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

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

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

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    await screen.findByText('How a tiny GPT predicts the next token')
    expect(screen.getAllByText('WebGPU').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getAllByText('Token Embedding').length).toBeGreaterThan(0)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it(
    'appends traces, ignores overlapping advances, and focuses code from story and scene',
    async () => {
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

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)
    await screen.findByText('How a tiny GPT predicts the next token')

    fireEvent.mouseEnter(screen.getAllByText('p2:12 -> p3:stop')[0])
    fireEvent.mouseLeave(screen.getAllByText('p2:12 -> p3:stop')[0])

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    for (let index = 0; index < 8; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

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
      expect(screen.getAllByText('p3:7 -> p4:8').length).toBeGreaterThan(0)
    })

    for (let index = 0; index < 14; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    await waitFor(() => {
      expect(screen.getAllByText('p4:8 -> p5:9').length).toBeGreaterThan(0)
    })
    expect(runtime.advance).toHaveBeenCalledTimes(2)
    },
    15000,
  )

  it('covers fetch failures, non-error bootstrap failures, and cancelled bootstrap branches', async () => {
    loadModelBundleMock.mockResolvedValue(bundleStub)
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

    const bundleDeferred = deferred<typeof bundleStub>()
    const sourceDeferred = deferred<string>()
    loadModelBundleMock.mockReturnValue(bundleDeferred.promise)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: () => sourceDeferred.promise,
    } as Response)
    runtimeCtorMock.mockClear()
    const cancelledBeforeInit = render(<App />)
    cancelledBeforeInit.unmount()
    bundleDeferred.resolve(bundleStub)
    sourceDeferred.resolve(sourceText)
    await Promise.resolve()
    expect(runtimeCtorMock).not.toHaveBeenCalled()

    const lateFailure = deferred<typeof bundleStub>()
    loadModelBundleMock.mockReturnValue(lateFailure.promise)
    mockSourceFetch(sourceText)
    const cancelledBeforeFailure = render(<App />)
    cancelledBeforeFailure.unmount()
    lateFailure.reject(new Error('late bundle failure'))
    await Promise.resolve()
    expect(runtimeCtorMock).not.toHaveBeenCalled()

    const initDeferred = deferred<{ activeBackend: 'cpu'; fallbackReason?: string }>()
    const runtime = makeRuntime()
    runtime.init.mockReturnValue(initDeferred.promise)
    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)
    const cancelledAfterCtor = render(<App />)
    await waitFor(() => {
      expect(runtime.init).toHaveBeenCalled()
    })
    cancelledAfterCtor.unmount()
    initDeferred.resolve({ activeBackend: 'cpu' })
    await Promise.resolve()
    expect(runtime.dispose).toHaveBeenCalled()
  })
})
