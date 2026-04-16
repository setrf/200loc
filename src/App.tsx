import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  createTokenizer,
  loadModelBundle,
  MicrogptRuntime,
  resolveAssetPath,
} from './model'
import { WalkthroughShell } from './components/WalkthroughShell'
import { IntroShell } from './intro/IntroShell'
import { initialIntroState, introReducer } from './intro/reducer'
import { readIntroCompletion, writeIntroCompletion } from './intro/storage'
import { introSteps } from './intro/steps'
import { normalizePrefixInput } from './prefixNormalization'
import {
  inferencePhases,
  type LineRange,
} from './walkthrough/phases'
import {
  initialWalkthroughState,
  type WalkthroughStatus,
  walkthroughReducer,
} from './walkthrough/reducer'
import type { SceneModelData } from './viz/llmViz/types'
import './App.css'

const phaseCount = inferencePhases.length

type AppScreen = 'loading' | 'intro' | 'walkthrough' | 'error'

export default function App() {
  const [state, dispatch] = useReducer(
    walkthroughReducer,
    initialWalkthroughState,
  )
  const [introState, introDispatch] = useReducer(
    introReducer,
    initialIntroState,
  )
  const [source, setSource] = useState('')
  const [sceneModelData, setSceneModelData] = useState<SceneModelData | null>(null)
  const [showIntro, setShowIntro] = useState(() => !readIntroCompletion())
  const [walkthroughReady, setWalkthroughReady] = useState(false)
  const runtimeRef = useRef<MicrogptRuntime | null>(null)
  const tokenizerRef = useRef<ReturnType<typeof createTokenizer> | null>(null)
  const advancingRef = useRef(false)
  const hydrateRequestRef = useRef(0)
  const prefixVersionRef = useRef(0)
  const lastStableStatusRef = useRef<WalkthroughStatus>('idle')

  useEffect(() => {
    if (state.status !== 'loading' && state.status !== 'error') {
      lastStableStatusRef.current = state.status
    }
  }, [state.status])

  async function hydrate(prefixInput: string) {
    const runtime = runtimeRef.current!
    const tokenizer = tokenizerRef.current!
    const normalization = tokenizer.normalizePrefix(prefixInput)
    const requestId = ++hydrateRequestRef.current
    const prefixVersion = prefixVersionRef.current
    dispatch({ type: 'loading' })
    try {
      const result = await runtime.reset(normalization.normalized)
      if (
        requestId !== hydrateRequestRef.current ||
        prefixVersion !== prefixVersionRef.current
      ) {
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
      if (
        requestId !== hydrateRequestRef.current ||
        prefixVersion !== prefixVersionRef.current
      ) {
        return
      }
      dispatch({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to reset walkthrough.',
      })
    }
  }

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

    prefixVersionRef.current += 1
    dispatch({
      type: 'setPrefixInput',
      prefixInput: draftNormalization.normalized,
      draftNormalization,
      status: nextStatus,
    })
  }, [state.status, state.traces.length])

  useEffect(() => {
    let cancelled = false

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
        hydrateRequestRef.current += 1
        const result = await runtime.reset(normalization.normalized)
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
        setWalkthroughReady(true)
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
      runtimeRef.current?.dispose()
    }
  }, [])

  async function advance() {
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

    try {
      const result = await runtimeRef.current.advance()
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
      dispatch({
        type: 'error',
        error: error instanceof Error ? error.message : 'Failed to advance model.',
      })
    } finally {
      advancingRef.current = false
    }
  }

  const trace = state.traces[state.activeTraceIndex]

  const handleIntroComplete = () => {
    writeIntroCompletion(true)
    setShowIntro(false)
  }

  const appScreen: AppScreen =
    state.status === 'error'
      ? 'error'
      : showIntro
        ? 'intro'
        : walkthroughReady && trace && source && sceneModelData && tokenizerRef.current
          ? 'walkthrough'
          : 'loading'

  if (appScreen === 'error') {
    return (
      <div className="app-shell app-shell--centered">
        <div className="empty-state">
          <p className="eyebrow">200loc</p>
          <h1>Failed to load the walkthrough.</h1>
          <p>{state.error}</p>
        </div>
      </div>
    )
  }

  if (appScreen === 'intro') {
    return (
      <IntroShell
        state={introState}
        steps={introSteps}
        walkthroughReady={walkthroughReady}
        onNext={() => introDispatch({ type: 'next', stepCount: introSteps.length })}
        onPrev={() => introDispatch({ type: 'prev' })}
        onSkip={handleIntroComplete}
        onFinish={handleIntroComplete}
      />
    )
  }

  if (
    appScreen === 'loading' ||
    !trace ||
    !source ||
    !sceneModelData ||
    !tokenizerRef.current
  ) {
    return (
      <div className="app-shell app-shell--centered">
        <div className="empty-state">
          <p className="eyebrow">200loc</p>
          <h1>Loading the model and canonical source…</h1>
          <p>
            Training is offline. The browser only fetches the exported checkpoint
            and `microgpt.py`.
          </p>
        </div>
      </div>
    )
  }

  return (
    <WalkthroughShell
      state={state}
      source={source}
      tokenizer={tokenizerRef.current}
      sceneModelData={sceneModelData}
      onFocusRanges={handleFocusRanges}
      onPrefixChange={handlePrefixChange}
      onHydrate={hydrate}
      onAdvance={advance}
      onSetPlaying={(playing) => dispatch({ type: 'setPlaying', playing })}
      onPhasePrev={() => dispatch({ type: 'phasePrev', phaseCount })}
      onSetMobileTab={(tab) => dispatch({ type: 'setMobileTab', tab })}
    />
  )
}
