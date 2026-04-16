import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  createTokenizer,
  loadModelBundle,
  MicrogptRuntime,
  resolveAssetPath,
} from './model'
import { normalizePrefixInput } from './prefixNormalization'
import { ArchitectureScene } from './components/ArchitectureScene'
import { CodeViewer } from './components/CodeViewer'
import { Controls } from './components/Controls'
import { IntroWalkthrough } from './components/IntroWalkthrough'
import { SegmentTabs } from './components/SegmentTabs'
import { useAutoplay } from './hooks/useAutoplay'
import { introSteps } from './intro/steps'
import { readHasSeenIntro, writeHasSeenIntro } from './intro/storage'
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
type AppMode = 'intro' | 'lab'

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>(() =>
    readHasSeenIntro() ? 'lab' : 'intro',
  )
  const [introStepIndex, setIntroStepIndex] = useState(0)
  const [state, dispatch] = useReducer(
    walkthroughReducer,
    initialWalkthroughState,
  )
  const [source, setSource] = useState('')
  const [sceneModelData, setSceneModelData] = useState<SceneModelData | null>(null)
  const runtimeRef = useRef<MicrogptRuntime | null>(null)
  const tokenizerRef = useRef<ReturnType<typeof createTokenizer> | null>(null)
  const advancingRef = useRef(false)
  const hydrateRequestRef = useRef(0)
  const prefixVersionRef = useRef(0)
  const lastStableStatusRef = useRef<WalkthroughStatus>('idle')
  const [reducedMotion, setReducedMotion] = useState(false)

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

  useAutoplay(
    state.status === 'playing',
    () => {
      void advance()
    },
    reducedMotion ? 1800 : 1100,
  )

  const trace = state.traces[state.activeTraceIndex]
  const phase = inferencePhases[state.activePhaseIndex]

  function openLab() {
    writeHasSeenIntro(true)
    setAppMode('lab')
  }

  function reopenIntro() {
    setIntroStepIndex(0)
    setAppMode('intro')
  }

  if (appMode === 'intro') {
    return (
      <div className="app-shell app-shell--intro">
        <IntroWalkthrough
          activeStepIndex={introStepIndex}
          steps={introSteps}
          onBack={() => {
            setIntroStepIndex((currentIndex) => Math.max(0, currentIndex - 1))
          }}
          onNext={() => {
            setIntroStepIndex((currentIndex) =>
              Math.min(introSteps.length - 1, currentIndex + 1),
            )
          }}
          onSkip={openLab}
          onOpenLab={openLab}
        />
      </div>
    )
  }

  if (state.status === 'error') {
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

  if (!trace || !phase || !source || !sceneModelData) {
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

  const tokenLabel = tokenizerRef.current!.tokenLabel
  const currentText = tokenizerRef.current!.decode(state.sequenceTokenIds)
  const currentTokenLabel = tokenLabel(trace.tokenId)
  const hasPendingPrefixChange = state.prefixInput !== state.appliedPrefixInput
  const prefixChars = [...state.appliedNormalization.normalized]
  const generatedBeforeCurrent =
    state.activeTraceIndex > 0
      ? state.traces
          .slice(0, Math.max(0, state.activeTraceIndex - 1))
          .map((item) => tokenLabel(item.sampledTokenId))
          .filter((token) => token !== 'BOS')
      : []
  const beforeCurrentTokens =
    state.activeTraceIndex === 0
      ? prefixChars.slice(0, Math.max(prefixChars.length - 1, 0))
      : [...prefixChars, ...generatedBeforeCurrent]
  const contextTokens =
    currentTokenLabel === 'BOS' && trace.positionId === 0
      ? ['BOS']
      : ['BOS', ...beforeCurrentTokens, currentTokenLabel]
  const activeRanges = state.hoverRanges ?? phase.codeRanges
  const canPrev = state.activePhaseIndex > 0 || state.activeTraceIndex > 0
  const canNext =
    state.activePhaseIndex < phaseCount - 1 ||
    state.activeTraceIndex < state.traces.length - 1 ||
    state.status !== 'terminal'
  const controlsLocked = state.status === 'loading'
  const navigationBlocked = controlsLocked || hasPendingPrefixChange
  const currentTextStatus =
    hasPendingPrefixChange
      ? 'Reset required'
      : state.status === 'loading'
      ? 'Resetting'
      : state.status === 'playing'
        ? 'Generating'
        : state.status === 'paused'
          ? 'Paused'
          : state.status === 'terminal'
            ? state.stopReason === 'context'
              ? 'Context full'
              : 'Stopped at BOS'
            : 'Ready'
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">200loc</p>
          <h2 className="app-header__title">How LLM systems actually work</h2>
        </div>
        <button
          type="button"
          className="ghost-button"
          onClick={reopenIntro}
        >
          Start intro again
        </button>
      </header>

      <div className="mobile-only">
        <SegmentTabs
          activeTab={state.mobileTab}
          onChange={(tab) => dispatch({ type: 'setMobileTab', tab })}
        />
      </div>

      <main className="walkthrough-layout">
        <aside
          className={`code-column ${
            state.mobileTab === 'code' ? 'is-active' : ''
          }`}
        >
          <div className="code-column__sticky">
            <CodeViewer source={source} activeRanges={activeRanges} />
          </div>
        </aside>

        <section
          className={`story-scene ${
            state.mobileTab === 'code' ? '' : 'is-active'
          }`}
        >
          <div className="story-scene__toolbar">
            <div className="story-scene__toolbar-main">
              <div
                className="scene-panel__stage-chip"
                onMouseEnter={() => handleFocusRanges(phase.codeRanges)}
                onMouseLeave={() => handleFocusRanges(null)}
              >
                <div className="scene-panel__stage-chip-top">
                  <span className="eyebrow">Current stage</span>
                  <span className="scene-panel__stage-step">
                    step {state.activePhaseIndex + 1} / {phaseCount}
                  </span>
                </div>
                <strong>{phase.groupTitle}</strong>
              </div>

              <div className="story-scene__toolbar-panel">
                <div className="story-scene__toolbar-inputs">
                  <label className="story-panel__field" htmlFor="prefix-input">
                    <div className="story-panel__field-head">
                      <span className="eyebrow">Starting text</span>
                    </div>
                    <input
                      id="prefix-input"
                      className="story-panel__input"
                      aria-label="Starting text"
                      value={state.prefixInput}
                      onChange={(event) => handlePrefixChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !controlsLocked) {
                          dispatch({ type: 'setPlaying', playing: false })
                          void hydrate(state.prefixInput)
                        }
                      }}
                      placeholder="em"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>

                  <div
                    className={`story-panel__field story-panel__field--readonly${
                      hasPendingPrefixChange ? ' is-stale' : ''
                    }`}
                  >
                    <div className="story-panel__field-head">
                      <span className="eyebrow">Current text</span>
                      <span className="story-panel__field-status">{currentTextStatus}</span>
                    </div>
                    <output
                      className={`story-panel__readout${currentText ? '' : ' is-empty'}`}
                      aria-label="Current text"
                      aria-live="polite"
                    >
                      {currentText || 'Nothing generated yet'}
                    </output>
                  </div>
                </div>

                <div className="story-scene__toolbar-footer">
                  <p className="story-panel__field-note">
                    {hasPendingPrefixChange
                      ? 'Current run still uses the previous starting text. Apply text to restart from your draft.'
                      : 'Edit the starting text, then reset when you want the model to restart from it.'}
                  </p>

                  <div className="story-panel__actions">
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'setPlaying', playing: false })
                        void hydrate(state.prefixInput)
                      }}
                      disabled={controlsLocked}
                    >
                      {hasPendingPrefixChange ? 'Apply text' : 'Reset'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'setPlaying', playing: false })
                        dispatch({ type: 'phasePrev', phaseCount })
                      }}
                      disabled={!canPrev || navigationBlocked}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'setPlaying', playing: false })
                        void advance()
                      }}
                      disabled={!canNext || navigationBlocked}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (state.status === 'playing') {
                          dispatch({ type: 'setPlaying', playing: false })
                        } else {
                          dispatch({ type: 'setPlaying', playing: true })
                        }
                      }}
                      disabled={!canNext || navigationBlocked}
                    >
                      {state.status === 'playing' ? 'Pause' : 'Play'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            className={`story-scene__scene ${
              state.mobileTab === 'scene' ? 'is-active' : ''
            }`}
          >
            <ArchitectureScene
              trace={trace}
              phase={phase}
              contextTokens={contextTokens}
              tokenLabel={tokenLabel}
              sceneModelData={sceneModelData}
              onFocusRanges={handleFocusRanges}
            />
          </div>

          <div
            className={`story-scene__story ${
              state.mobileTab === 'story' ? 'is-active' : ''
            }`}
          >
            <Controls
              key={`${state.mobileTab}-${phase.stepId}-${trace.positionId}-${trace.tokenId}-${trace.sampledTokenId}`}
              beats={phase.copy.beats}
            />
          </div>
        </section>
      </main>
    </div>
  )
}
