import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  createTokenizer,
  loadModelBundle,
  MicrogptRuntime,
  resolveAssetPath,
} from '../model'
import { useAutoplay } from '../hooks/useAutoplay'
import { normalizePrefixInput } from '../prefixNormalization'
import { inferencePhases, type LineRange } from '../walkthrough/phases'
import {
  initialWalkthroughState,
  type WalkthroughStatus,
  walkthroughReducer,
} from '../walkthrough/reducer'
import type { SceneModelData } from '../viz/llmViz/types'

export const phaseCount = inferencePhases.length

export function useWalkthroughController() {
  const [state, dispatch] = useReducer(
    walkthroughReducer,
    initialWalkthroughState,
  )
  const [source, setSource] = useState('')
  const [sceneModelData, setSceneModelData] = useState<SceneModelData | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const runtimeRef = useRef<MicrogptRuntime | null>(null)
  const tokenizerRef = useRef<ReturnType<typeof createTokenizer> | null>(null)
  const mountedRef = useRef(true)
  const advancingRef = useRef(false)
  const advanceRequestRef = useRef(0)
  const hydrateRequestRef = useRef(0)
  const draftVersionRef = useRef(0)
  const runVersionRef = useRef(0)
  const lastStableStatusRef = useRef<WalkthroughStatus>('idle')

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => {
      media.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (state.status !== 'loading' && state.status !== 'error') {
      lastStableStatusRef.current = state.status
    }
  }, [state.status])

  const hydrate = useCallback(async (prefixInput: string) => {
    const runtime = runtimeRef.current!
    const tokenizer = tokenizerRef.current!
    const normalization = tokenizer.normalizePrefix(prefixInput)
    const requestId = ++hydrateRequestRef.current
    const draftVersion = draftVersionRef.current
    runVersionRef.current += 1
    advanceRequestRef.current += 1
    advancingRef.current = false
    const isFresh = () =>
      mountedRef.current &&
      requestId === hydrateRequestRef.current &&
      draftVersion === draftVersionRef.current
    dispatch({ type: 'loading' })
    try {
      const result = await runtime.reset(normalization.normalized, isFresh)
      if (!isFresh()) {
        return
      }
      dispatch({
        type: 'reset',
        prefixInput: normalization.normalized,
        normalization,
        trace: result.trace,
        sequenceTokenIds: result.session.visibleTokenIds,
        backend: result.diagnostics.activeBackend,
        fallbackReason: result.diagnostics.fallbackReason,
        terminal: result.session.done,
        doneReason: result.session.doneReason,
      })
    } catch (error) {
      if (!isFresh()) {
        return
      }
      dispatch({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to reset walkthrough.',
      })
    }
  }, [])

  const handleFocusRanges = useCallback((ranges: LineRange[] | null) => {
    dispatch({ type: 'setHoverRanges', ranges })
  }, [])

  const handlePrefixChange = useCallback((value: string) => {
    const draftNormalization = normalizePrefixInput(tokenizerRef.current, value)
    const nextStatus =
      state.status === 'playing'
        ? 'paused'
        : state.status === 'loading' && state.traces.length > 0
          ? lastStableStatusRef.current === 'playing'
            ? 'paused'
            : lastStableStatusRef.current
          : undefined

    draftVersionRef.current += 1
    dispatch({
      type: 'setPrefixInput',
      prefixInput: draftNormalization.normalized,
      draftNormalization,
      status: nextStatus,
    })
  }, [state.status, state.traces.length])

  useEffect(() => {
    let cancelled = false
    mountedRef.current = true

    async function bootstrap() {
      dispatch({ type: 'loading' })
      try {
        const [bundle, sourceText] = await Promise.all([
          loadModelBundle(),
          fetch(resolveAssetPath('assets/microgpt.py')).then((response) => {
            if (!response.ok) {
              throw new Error('Failed to load microgpt.py')
            }
            return response.text()
          }),
        ])

        if (cancelled) {
          return
        }

        const runtime = new MicrogptRuntime(bundle)
        await runtime.init()

        if (cancelled) {
          runtime.dispose()
          return
        }

        runtimeRef.current = runtime
        tokenizerRef.current = createTokenizer(bundle)
        setSceneModelData({
          config: bundle.config,
          vocab: bundle.vocab,
          weights: bundle.weights,
        })
        setSource(sourceText)
        const normalization = tokenizerRef.current.normalizePrefix('')
        const requestId = ++hydrateRequestRef.current
        runVersionRef.current += 1
        const isFresh = () =>
          mountedRef.current &&
          !cancelled &&
          requestId === hydrateRequestRef.current
        const result = await runtime.reset(normalization.normalized, isFresh)
        if (!isFresh()) {
          return
        }
        dispatch({
          type: 'reset',
          prefixInput: '',
          normalization,
          trace: result.trace,
          sequenceTokenIds: result.session.visibleTokenIds,
          backend: result.diagnostics.activeBackend,
          fallbackReason: result.diagnostics.fallbackReason,
          terminal: result.session.done,
          doneReason: result.session.doneReason,
        })
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: 'error',
            error:
              error instanceof Error ? error.message : 'Failed to initialize app.',
          })
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      mountedRef.current = false
      hydrateRequestRef.current += 1
      advanceRequestRef.current += 1
      runVersionRef.current += 1
      advancingRef.current = false
      runtimeRef.current?.dispose()
    }
  }, [])

  const advance = useCallback(async () => {
    if (advancingRef.current || !runtimeRef.current) {
      return
    }

    if (
      state.activePhaseIndex < phaseCount - 1 ||
      state.activeTraceIndex < state.traces.length - 1
    ) {
      dispatch({ type: 'phaseNext', phaseCount })
      return
    }

    advancingRef.current = true
    const advanceRequestId = ++advanceRequestRef.current
    const runVersion = runVersionRef.current
    const isFresh = () =>
      mountedRef.current &&
      advanceRequestId === advanceRequestRef.current &&
      runVersion === runVersionRef.current

    try {
      const result = await runtimeRef.current.advance()
      if (!isFresh()) {
        return
      }
      dispatch({
        type: 'appendTrace',
        trace: result.trace,
        sequenceTokenIds: result.session.visibleTokenIds,
        backend: result.diagnostics.activeBackend,
        fallbackReason: result.diagnostics.fallbackReason,
        terminal: result.session.done,
        doneReason: result.session.doneReason,
      })
    } catch (error) {
      if (!isFresh()) {
        return
      }
      dispatch({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to advance model.',
      })
    } finally {
      if (advanceRequestId === advanceRequestRef.current) {
        advancingRef.current = false
      }
    }
  }, [state.activePhaseIndex, state.activeTraceIndex, state.traces.length])

  useAutoplay(
    state.status === 'playing',
    () => {
      void advance()
    },
    reducedMotion ? 1800 : 1100,
  )

  return {
    advance,
    dispatch,
    handleFocusRanges,
    handlePrefixChange,
    hydrate,
    sceneModelData,
    source,
    state,
    tokenizer: tokenizerRef.current,
  }
}
