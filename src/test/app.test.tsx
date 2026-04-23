import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { INTRO_SEEN_STORAGE_KEY } from '../intro/storage'
import { LAB_TOUR_SEEN_STORAGE_KEY } from '../labTour/storage'
import type { PrefixNormalization } from '../model'
import { getCodeExplainerText, inferencePhases } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

const loadModelBundleMock = vi.fn()
const createTokenizerMock = vi.fn()
const runtimeCtorMock = vi.fn()
const phaseCount = inferencePhases.length
const phaseBeat = (index: number) =>
  inferencePhases[index]!.copy.beats[0]!.segments
    .map((segment) => segment.text)
    .join('')
const phaseCodeExplainer = (index: number) =>
  getCodeExplainerText(inferencePhases[index]!)
const stepControlLabel = (index: number) =>
  `Current step: ${inferencePhases[index]!.stepTitle}. Technical stage: ${inferencePhases[index]!.groupTitle}. Step ${index + 1} of ${phaseCount}.`

vi.mock('../model', () => ({
  loadModelBundle: loadModelBundleMock,
  createTokenizer: createTokenizerMock,
  MicrogptRuntime: runtimeCtorMock,
  resolveAssetPath: (path: string) => `/${path.replace(/^\/+/, '')}`,
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

function findCodeLine(text: string) {
  return screen.getByText((_, element) => {
    return (
      element?.classList.contains('code-viewer__code') === true &&
      element.textContent === text
    )
  })
}

function expectStoryPanelToContain(text: string) {
  const lesson = screen.getByLabelText('Step explanation')
  expect(lesson.textContent).toContain(text)
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
    window.localStorage.setItem(INTRO_SEEN_STORAGE_KEY, 'true')
    window.localStorage.setItem(LAB_TOUR_SEEN_STORAGE_KEY, 'true')
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
    window.localStorage.clear()
  })

  it('shows the intro on first visit, then skips into the live walkthrough', async () => {
    window.localStorage.removeItem(INTRO_SEEN_STORAGE_KEY)
    window.localStorage.removeItem(LAB_TOUR_SEEN_STORAGE_KEY)

    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('AI is everywhere these days.')
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    await screen.findByRole('dialog', { name: 'Lab tour' })
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getAllByRole('button', { name: 'Next' }).at(-1)!)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Start exploring' }))
    await screen.findByRole('button', { name: 'Start intro again' })
    expect(window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY)).toBe('true')
    expect(window.localStorage.getItem(LAB_TOUR_SEEN_STORAGE_KEY)).toBe('true')
  })

  it('skips straight into the lab when the tour was already seen, and the intro back button clamps correctly', async () => {
    window.localStorage.removeItem(INTRO_SEEN_STORAGE_KEY)
    window.localStorage.setItem(LAB_TOUR_SEEN_STORAGE_KEY, 'true')

    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('AI is everywhere these days.')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(
      screen.getByText('AI is everywhere these days.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    await screen.findByText('A complete tiny LLM, step by step')
    expect(screen.queryByRole('dialog', { name: 'Lab tour' })).not.toBeInTheDocument()
  })

  it('opens the project info dialog from the header', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')
    fireEvent.click(screen.getByRole('button', { name: 'About' }))

    const dialog = screen.getByRole('dialog', { name: 'Project information' })
    expect(within(dialog).getByText('About this project')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        /200loc shows how LLMs work end to end by using microgpt/,
      ),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('mertgulsun.com')).toBeInTheDocument()
    expect(within(dialog).getByText('github.com/setrf/200loc')).toBeInTheDocument()
    expect(within(dialog).getByText('MIT License')).toBeInTheDocument()
    expect(within(dialog).getByText('Andrej Karpathy')).toBeInTheDocument()
    expect(within(dialog).getByText('LLM Visualization')).toBeInTheDocument()
  })

  it('renders the compact layout, steps the lab tour backward, and closes project info in every supported way', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(hover: none), (pointer: coarse), (max-width: 1023px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')
    expect(screen.getAllByText('See the readable history').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Starting text')).not.toBeInTheDocument()
    expect(screen.queryByText('predicts next character')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Step controls')).toBeInTheDocument()
    expect(screen.getByLabelText(stepControlLabel(0))).toHaveAttribute(
      'data-step-label',
      'Step 1 of 34',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    expect(screen.getByLabelText('Step explanation')).toBeInTheDocument()
    expect(screen.getByLabelText('Step controls')).toBeInTheDocument()
    expect(screen.getByText('microgpt.py')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByLabelText('Step explanation')).toBeInTheDocument()
    expect(screen.getByLabelText('Step controls')).toBeInTheDocument()
    expect(screen.getByTestId('scene-viewport')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show lab tour' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()

    const tour = await screen.findByRole('dialog', { name: 'Lab tour' })
    expect(
      within(tour).getByText('Use these tabs to switch views'),
    ).toBeInTheDocument()

    fireEvent.click(within(tour).getByRole('button', { name: 'Next' }))
    expect(
      within(screen.getByRole('dialog', { name: 'Lab tour' })).getByText(
        'This is how you drive the walkthrough',
      ),
    ).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('dialog', { name: 'Lab tour' })).getByRole('button', {
      name: 'Next',
    }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Code' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Lab tour' })).getByRole('button', {
        name: 'Back',
      }),
    )
    expect(
      within(screen.getByRole('dialog', { name: 'Lab tour' })).getByText(
        'This is how you drive the walkthrough',
      ),
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: 'Expand explanation panel' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Step explanation')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Project information' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close project information' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Project information' }),
      ).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Project information' }),
      ).not.toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'About' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Project information' }),
      ).not.toBeInTheDocument()
    })
  })

  it('keeps compact tabs usable even when a panel has been collapsed', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: query === '(hover: none), (pointer: coarse), (max-width: 1023px)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })

    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))

    expect(
      screen.queryByRole('button', { name: 'Expand code panel' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('microgpt.py')).toBeInTheDocument()
  })

  it.skip('applies the prefix when Enter is pressed and keeps the generated text current', async () => {
    const runtime = makeRuntime()
    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({
          sampledTokenId: 26,
          positionId: 3,
        }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockResolvedValueOnce({
        trace: makeTrace({
          sampledTokenId: 8,
          positionId: 255,
        }),
        session: { visibleTokenIds: [4, 12, 8], done: true, doneReason: 'context' },
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

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    fireEvent.change(prefix, { target: { value: 'Em!42' } })
    fireEvent.keyDown(prefix, { key: 'Tab' })
    expect(runtime.reset).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(prefix, { key: 'Enter' })

    await waitFor(() => {
      expect(runtime.reset).toHaveBeenLastCalledWith('em', expect.any(Function))
    })
    expect(screen.getByLabelText('Generated text')).toHaveTextContent('emi')
  })

  it.skip('keeps a draft in the ready state when the prefix changes during a reset from a ready session', async () => {
    const runtime = makeRuntime()
    const deferredReset = deferred<{
      trace: ReturnType<typeof makeTrace>
      session: { visibleTokenIds: number[]; done: boolean }
      diagnostics: { activeBackend: 'cpu'; fallbackReason?: string }
    }>()

    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockImplementationOnce(() => deferredReset.promise)

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    fireEvent.change(prefix, { target: { value: 'em' } })
    fireEvent.click(screen.getByRole('button', { name: /Reset|Apply text/ }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Apply text' })).toBeDisabled()
    })

    fireEvent.change(prefix, { target: { value: 'emi' } })

    expect(screen.queryByText('Resetting')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByLabelText('Generated text')).toHaveTextContent('em')

    deferredReset.resolve({
      trace: makeTrace({ positionId: 3, tokenId: 8, sampledTokenId: 8 }),
      session: { visibleTokenIds: [4, 12, 8], done: false },
      diagnostics: {
        activeBackend: 'cpu',
        fallbackReason: 'WebGPU unavailable',
      },
    })

    await Promise.resolve()
  })

  it.skip('pauses back to a draft state when the prefix changes during a reset from autoplay', async () => {
    const runtime = makeRuntime()
    const deferredReset = deferred<{
      trace: ReturnType<typeof makeTrace>
      session: { visibleTokenIds: number[]; done: boolean }
      diagnostics: { activeBackend: 'cpu'; fallbackReason?: string }
    }>()

    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockImplementationOnce(() => deferredReset.promise)

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
    })

    fireEvent.change(prefix, { target: { value: 'emi' } })

    expect(screen.getByRole('button', { name: 'Apply text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument()

    deferredReset.resolve({
      trace: makeTrace({ positionId: 3, tokenId: 8, sampledTokenId: 8 }),
      session: { visibleTokenIds: [4, 12, 8], done: false },
      diagnostics: {
        activeBackend: 'cpu',
        fallbackReason: 'WebGPU unavailable',
      },
    })

    await Promise.resolve()
  })

  it('collapses and expands supporting panels while keeping explanation visible', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')

    fireEvent.click(document.querySelector('button[aria-controls="code-panel-body"]') as HTMLButtonElement)
    expect(screen.getByRole('button', { name: 'Expand code panel' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Expand explanation panel' }),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand code panel' }))

    fireEvent.click(document.querySelector('button[aria-controls="code-panel-body"]') as HTMLButtonElement)
    fireEvent.click(document.querySelector('button[aria-controls="scene-panel-body"]') as HTMLButtonElement)

    expect(screen.queryByText('microgpt.py')).not.toBeInTheDocument()
    expect(screen.queryByTestId('scene-viewport')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Step explanation')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand code panel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand model viewer panel' }))

    expect(screen.getByText('microgpt.py')).toBeInTheDocument()
    expect(screen.getByTestId('scene-viewport')).toBeInTheDocument()
    expect(screen.getByLabelText('Step explanation')).toBeInTheDocument()
  })

  it('finishes the intro, remembers it, and can reopen it from the lab', async () => {
    window.localStorage.removeItem(INTRO_SEEN_STORAGE_KEY)
    window.localStorage.removeItem(LAB_TOUR_SEEN_STORAGE_KEY)

    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('AI is everywhere these days.')
    for (let index = 0; index < 6; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    expect(
      screen.getByRole('button', { name: 'Open live walkthrough' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open live walkthrough' }))

    await screen.findByRole('dialog', { name: 'Lab tour' })
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getAllByRole('button', { name: 'Next' }).at(-1)!)
    }
    fireEvent.click(screen.getByRole('button', { name: 'Start exploring' }))
    await screen.findByRole('button', { name: 'Start intro again' })
    expect(screen.getByRole('button', { name: 'Show lab tour' })).toBeInTheDocument()
    expect(window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY)).toBe('true')
    expect(window.localStorage.getItem(LAB_TOUR_SEEN_STORAGE_KEY)).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Start intro again' }))
    await screen.findByText('AI is everywhere these days.')
  })

  it('can replay the lab tour from the header', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')
    fireEvent.click(screen.getByRole('button', { name: 'Show lab tour' }))

    const tour = await screen.findByRole('dialog', { name: 'Lab tour' })
    fireEvent.click(within(tour).getByRole('button', { name: 'Next' }))
    expect(
      within(tour).getByText('This is how you drive the walkthrough'),
    ).toBeInTheDocument()
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

    await screen.findByText('A complete tiny LLM, step by step')
    expect(screen.getByText('microgpt.py')).toBeInTheDocument()
    expect(screen.getAllByText('See the readable history').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Code explainer')).toHaveTextContent(
      'These lines build the visible prefix',
    )
    expect(screen.queryByLabelText('Generated text')).not.toBeInTheDocument()
    expect(await screen.findByTestId('fallback-scene')).toBeInTheDocument()
    expect(findCodeLine('line 117').closest('li')).not.toHaveClass('is-active')

    fireEvent.mouseEnter(
      screen.getByLabelText(stepControlLabel(0)),
    )
    expect(findCodeLine('line 23').closest('li')).toHaveClass('is-active')
    fireEvent.mouseLeave(
      screen.getByLabelText(stepControlLabel(0)),
    )
    fireEvent.focus(
      screen.getByLabelText(stepControlLabel(0)),
    )
    expect(findCodeLine('line 23').closest('li')).toHaveClass('is-active')
    fireEvent.blur(
      screen.getByLabelText(stepControlLabel(0)),
    )
    fireEvent.mouseEnter(screen.getByLabelText('Architecture scene'))
    expect(document.querySelectorAll('.code-viewer__line.is-active').length).toBeGreaterThan(0)
    fireEvent.mouseLeave(screen.getByLabelText('Architecture scene'))

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenLastCalledWith('', expect.any(Function))
    })

    for (let index = 0; index < 3; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(
      screen.getByLabelText(stepControlLabel(3)),
    ).toBeInTheDocument()
    expectStoryPanelToContain(phaseBeat(3))
    expect(screen.getByLabelText('Code explainer')).toHaveTextContent(
      phaseCodeExplainer(3),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Prev' }))
    expectStoryPanelToContain(phaseBeat(2))
    expect(screen.getByLabelText('Code explainer')).toHaveTextContent(
      phaseCodeExplainer(2),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    for (let index = 0; index < 12; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expectStoryPanelToContain(phaseBeat(15))

    for (let index = 0; index < 13; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expectStoryPanelToContain(phaseBeat(28))

    for (let index = 0; index < 5; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(
      screen.getByLabelText(stepControlLabel(33)),
    ).toBeInTheDocument()
    expectStoryPanelToContain(phaseBeat(33))

    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
    expect(screen.getByRole('button', { name: 'Scene' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    expect(screen.getByRole('button', { name: 'Code' })).toHaveAttribute(
      'aria-pressed',
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
    await screen.findByText('A complete tiny LLM, step by step')

    for (let index = 0; index < phaseCount; index += 1) {
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

    await screen.findByText('A complete tiny LLM, step by step')
    expect(screen.getByText(phaseBeat(0))).toBeInTheDocument()
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
    await screen.findByText('A complete tiny LLM, step by step')

    for (let index = 0; index < phaseCount; index += 1) {
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

    await screen.findByText('A complete tiny LLM, step by step')
    expect(screen.getByLabelText(stepControlLabel(0))).toHaveAttribute(
      'data-step-label',
      `Step 1 of ${phaseCount}`,
    )

    fireEvent.click(screen.getByRole('button', { name: /Reset|Apply text/ }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenCalledTimes(2)
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByLabelText(stepControlLabel(1))).toHaveAttribute(
        'data-step-label',
        `Step 2 of ${phaseCount}`,
      )
      expect(screen.getByText(phaseBeat(1))).toBeInTheDocument()
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
    await screen.findByText('A complete tiny LLM, step by step')

    for (let index = 0; index < phaseCount - 1; index += 1) {
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
      expect(screen.getByLabelText(stepControlLabel(0))).toHaveAttribute(
        'data-step-label',
        `Step 1 of ${phaseCount}`,
      )
    })

    for (let index = 0; index < phaseCount; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }

    await waitFor(() => {
      expect(runtime.advance).toHaveBeenCalledTimes(2)
    })
    expect(runtime.advance).toHaveBeenCalledTimes(2)
    },
    30000,
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

    const resetDeferred = deferred<{
      trace: ReturnType<typeof makeTrace>
      session: { visibleTokenIds: number[]; done: boolean }
      diagnostics: { activeBackend: 'cpu'; fallbackReason?: string }
    }>()
    const resetRuntime = makeRuntime()
    resetRuntime.reset.mockReturnValue(resetDeferred.promise)
    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return resetRuntime
    })
    mockSourceFetch(sourceText)
    const cancelledAfterResetStarted = render(<App />)
    await waitFor(() => {
      expect(resetRuntime.reset).toHaveBeenCalled()
    })
    cancelledAfterResetStarted.unmount()
    await act(async () => {
      resetDeferred.resolve({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      await resetDeferred.promise
    })
    expect(resetRuntime.dispose).toHaveBeenCalled()
  })

  it.skip('ignores stale reset results after the prefix changes again', async () => {
    const runtime = makeRuntime()
    const deferredReset = deferred<{
      trace: ReturnType<typeof makeTrace>
      session: { visibleTokenIds: number[]; done: boolean }
      diagnostics: { activeBackend: 'cpu'; fallbackReason?: string }
    }>()

    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockImplementationOnce(() => deferredReset.promise)

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    fireEvent.change(prefix, { target: { value: 'em' } })
    fireEvent.click(screen.getByRole('button', { name: /Reset|Apply text/ }))
    fireEvent.change(prefix, { target: { value: 'emi' } })
    expect(
      screen.getByText('Apply starting text to restart from this input.'),
    ).toBeInTheDocument()

    await act(async () => {
      deferredReset.resolve({
        trace: makeTrace({ positionId: 3, tokenId: 8, sampledTokenId: 8 }),
        session: { visibleTokenIds: [4, 12, 8], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      await deferredReset.promise
    })

    await waitFor(() => {
      expect(prefix).toHaveValue('emi')
    })
    expect(runtime.reset).toHaveBeenLastCalledWith('em', expect.any(Function))
    expect(screen.getByLabelText(stepControlLabel(0))).toHaveAttribute(
      'data-step-label',
      `Step 1 of ${phaseCount}`,
    )
    expect(screen.queryByText('Loading the model and canonical source…')).not.toBeInTheDocument()
  })

  it.skip('ignores stale advance results after a reset starts', async () => {
    const runtime = makeRuntime()
    const deferredAdvance = deferred<{
      trace: ReturnType<typeof makeTrace>
      session: { visibleTokenIds: number[]; done: boolean }
      diagnostics: { activeBackend: 'cpu'; fallbackReason?: string }
    }>()

    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockResolvedValueOnce({
        trace: makeTrace({ positionId: 3, tokenId: 8, sampledTokenId: 8 }),
        session: { visibleTokenIds: [4, 12, 8], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
    runtime.advance.mockReturnValueOnce(deferredAdvance.promise)

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    for (let index = 0; index < phaseCount - 1; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(runtime.advance).toHaveBeenCalledTimes(1)

    fireEvent.change(prefix, { target: { value: 'emi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply text' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenLastCalledWith('emi', expect.any(Function))
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Generated text')).toHaveTextContent('emi')
    })

    await act(async () => {
      deferredAdvance.resolve({
        trace: makeTrace({ positionId: 3, tokenId: 7, sampledTokenId: 7 }),
        session: { visibleTokenIds: [4, 12, 7], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      await deferredAdvance.promise
    })

    expect(screen.getByLabelText('Generated text')).toHaveTextContent('emi')
    expect(screen.queryByText('Failed to load the walkthrough.')).not.toBeInTheDocument()
  })

  it.skip('ignores stale advance failures after a reset starts', async () => {
    const runtime = makeRuntime()
    const deferredAdvance = deferred<never>()

    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockResolvedValueOnce({
        trace: makeTrace({ positionId: 3, tokenId: 8, sampledTokenId: 8 }),
        session: { visibleTokenIds: [4, 12, 8], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
    runtime.advance.mockReturnValueOnce(deferredAdvance.promise)

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    for (let index = 0; index < phaseCount - 1; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(runtime.advance).toHaveBeenCalledTimes(1)

    fireEvent.change(prefix, { target: { value: 'emi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply text' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenLastCalledWith('emi', expect.any(Function))
    })
    await waitFor(() => {
      expect(screen.getByLabelText('Generated text')).toHaveTextContent('emi')
    })

    await act(async () => {
      deferredAdvance.reject(new Error('stale advance failed'))
      await deferredAdvance.promise.catch(() => {})
    })

    expect(screen.getByLabelText('Generated text')).toHaveTextContent('emi')
    expect(screen.queryByText('Failed to load the walkthrough.')).not.toBeInTheDocument()
    expect(screen.queryByText('stale advance failed')).not.toBeInTheDocument()
  })

  it.skip('keeps an in-flight advance visible when the user only edits the draft prefix', async () => {
    const runtime = makeRuntime()
    const deferredAdvance = deferred<{
      trace: ReturnType<typeof makeTrace>
      session: { visibleTokenIds: number[]; done: boolean }
      diagnostics: { activeBackend: 'cpu'; fallbackReason?: string }
    }>()

    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
      diagnostics: {
        activeBackend: 'cpu',
        fallbackReason: 'WebGPU unavailable',
      },
    })
    runtime.advance.mockReturnValueOnce(deferredAdvance.promise)

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    for (let index = 0; index < phaseCount - 1; index += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(runtime.advance).toHaveBeenCalledTimes(1)

    fireEvent.change(prefix, { target: { value: 'emi' } })

    await act(async () => {
      deferredAdvance.resolve({
        trace: makeTrace({ positionId: 3, tokenId: 7, sampledTokenId: 7 }),
        session: { visibleTokenIds: [4, 12, 7], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      await deferredAdvance.promise
    })

    expect(screen.getByLabelText('Generated text')).toHaveTextContent('emh')
    expect(screen.getByRole('button', { name: 'Apply text' })).toBeInTheDocument()
    expect(
      screen.getByText('Apply starting text to restart from this input.'),
    ).toBeInTheDocument()
  })

  it.skip('treats starting-text edits as a draft and pauses the active run until applied', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace({ sampledTokenId: 26 }),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')
    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    fireEvent.change(prefix, { target: { value: 'em' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply text' }))
    await waitFor(() => {
      expect(runtime.reset).toHaveBeenLastCalledWith('em', expect.any(Function))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    fireEvent.change(prefix, { target: { value: 'emi' } })

    expect(screen.getByRole('button', { name: 'Apply text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByLabelText('Generated text')).toHaveTextContent('em')
    expect(
      screen.getByText('Apply starting text to restart from this input.'),
    ).toBeInTheDocument()

    fireEvent.change(prefix, { target: { value: 'em' } })

    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(
      screen.queryByText('Apply starting text to restart from this input.'),
    ).not.toBeInTheDocument()
  })

  it.skip('surfaces reset failures and ignores stale reset failures after the prefix changes', async () => {
    const runtime = makeRuntime()
    const staleFailure = deferred<never>()

    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockImplementationOnce(() => staleFailure.promise)
      .mockRejectedValueOnce(new Error('reset failed'))

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    fireEvent.change(prefix, { target: { value: 'em' } })
    fireEvent.click(screen.getByRole('button', { name: /Reset|Apply text/ }))
    fireEvent.change(prefix, { target: { value: 'emi' } })
    staleFailure.reject(new Error('stale reset failed'))
    await Promise.resolve()

    fireEvent.click(screen.getByRole('button', { name: /Reset|Apply text/ }))
    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('reset failed')).toBeInTheDocument()
  })

  it.skip('falls back to the generic reset error message for non-Error rejections', async () => {
    const runtime = makeRuntime()

    runtime.reset
      .mockResolvedValueOnce({
        trace: makeTrace({ sampledTokenId: 26 }),
        session: { visibleTokenIds: [4, 12], done: false },
        diagnostics: {
          activeBackend: 'cpu',
          fallbackReason: 'WebGPU unavailable',
        },
      })
      .mockRejectedValueOnce('reset failed')

    loadModelBundleMock.mockResolvedValue(bundleStub)
    createTokenizerMock.mockReturnValue(makeTokenizer())
    runtimeCtorMock.mockImplementation(function () {
      return runtime
    })
    mockSourceFetch(sourceText)

    const { default: App } = await import('../App')
    render(<App />)

    const prefix = await screen.findByRole('textbox', { name: 'Starting text' })
    fireEvent.change(prefix, { target: { value: 'em' } })
    fireEvent.click(screen.getByRole('button', { name: /Reset|Apply text/ }))

    await screen.findByText('Failed to load the walkthrough.')
    expect(screen.getByText('Failed to reset walkthrough.')).toBeInTheDocument()
  })

  it('closes an open annotation when the phase advances or the walkthrough resets', async () => {
    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')

    fireEvent.click(
      document.querySelector('[data-glossary-id="context"]') as HTMLElement,
    )
    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('Context')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
    })

    fireEvent.click(document.querySelector('.annotation-trigger') as HTMLElement)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Reset|Apply text/ }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
    })
  })

  it('closes a compact explanation popin when the user switches supporting tabs', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    })

    const runtime = makeRuntime()
    runtime.reset.mockResolvedValue({
      trace: makeTrace(),
      session: { visibleTokenIds: [4, 12], done: false },
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

    await screen.findByText('A complete tiny LLM, step by step')

    fireEvent.click(document.querySelector('.annotation-trigger') as HTMLElement)
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
    })
  })
})
