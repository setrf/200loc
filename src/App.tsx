import { useEffect, useReducer, useRef, useState } from 'react'
import {
  createTokenizer,
  loadModelBundle,
  MicrogptRuntime,
} from './model'
import { ArchitectureScene } from './components/ArchitectureScene'
import { CodeViewer } from './components/CodeViewer'
import { Controls } from './components/Controls'
import { SegmentTabs } from './components/SegmentTabs'
import { useAutoplay } from './hooks/useAutoplay'
import { inferencePhases, trainingAppendix } from './walkthrough/phases'
import {
  initialWalkthroughState,
  walkthroughReducer,
} from './walkthrough/reducer'
import type { SceneModelData } from './viz/llmViz/types'
import './App.css'

const phaseCount = inferencePhases.length

export default function App() {
  const [state, dispatch] = useReducer(
    walkthroughReducer,
    initialWalkthroughState,
  )
  const [source, setSource] = useState('')
  const [sceneModelData, setSceneModelData] = useState<SceneModelData | null>(null)
  const runtimeRef = useRef<MicrogptRuntime | null>(null)
  const tokenizerRef = useRef<ReturnType<typeof createTokenizer> | null>(null)
  const advancingRef = useRef(false)
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

  async function hydrate(prefixInput: string) {
    const runtime = runtimeRef.current!
    const tokenizer = tokenizerRef.current!
    dispatch({ type: 'loading' })
    const normalization = tokenizer.normalizePrefix(prefixInput)
    const result = await runtime.reset(normalization.normalized)
    dispatch({
      type: 'reset',
      prefixInput,
      normalization,
      trace: result.trace,
      sequenceTokenIds: result.session.visibleTokenIds,
      backend: result.diagnostics.activeBackend,
      fallbackReason: result.diagnostics.fallbackReason,
      terminal: result.session.done,
    })
  }

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      dispatch({ type: 'loading' })
      try {
        const [bundle, sourceText] = await Promise.all([
          loadModelBundle(),
          fetch('/assets/microgpt.py').then((response) => {
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
  const currentTokenLabel = tokenLabel(trace.tokenId)
  const sampledTokenLabel = tokenLabel(trace.sampledTokenId)
  const nextTokenLabel = sampledTokenLabel === 'BOS' ? 'stop' : sampledTokenLabel
  const backendStatusLabel = state.backend === 'webgpu' ? 'WebGPU' : 'CPU fallback'
  const prefixChars = [...state.normalization.normalized]
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
  const transitionLabel = `p${trace.positionId}:${currentTokenLabel} -> p${trace.positionId + 1}:${nextTokenLabel}`

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">200loc</p>
          <h2 className="app-header__title">How a tiny GPT predicts the next token</h2>
        </div>
        <div className="app-header__meta">
          <span>{backendStatusLabel}</span>
          <span>{phase.title}</span>
          <span>{transitionLabel}</span>
        </div>
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
          <div
            className={`story-scene__story ${
              state.mobileTab === 'story' ? 'is-active' : ''
            }`}
          >
            <Controls
              prefix={state.prefixInput}
              normalization={state.normalization}
              backend={state.backend}
              fallbackReason={state.fallbackReason}
              phaseTitle={phase.title}
              phaseStep={state.activePhaseIndex + 1}
              phaseCount={phaseCount}
              transitionLabel={transitionLabel}
              explanationTitle={phase.explanationTitle(trace, tokenLabel)}
              explanationBody={phase.explanationBody(trace, tokenLabel)}
              explanationWhy={phase.explanationWhy(trace, tokenLabel)}
              codeRanges={phase.codeRanges}
              appendixOpen={state.appendixOpen}
              appendixSections={trainingAppendix}
              playing={state.status === 'playing'}
              canPrev={canPrev}
              canNext={canNext}
              onPrefixChange={(value) =>
                dispatch({ type: 'setPrefixInput', prefixInput: value })
              }
              onReset={() => {
                dispatch({ type: 'setPlaying', playing: false })
                void hydrate(state.prefixInput)
              }}
              onPrev={() => {
                dispatch({ type: 'setPlaying', playing: false })
                dispatch({ type: 'phasePrev', phaseCount })
              }}
              onNext={() => {
                dispatch({ type: 'setPlaying', playing: false })
                void advance()
              }}
              onTogglePlay={() => {
                if (state.status === 'playing') {
                  dispatch({ type: 'setPlaying', playing: false })
                } else {
                  dispatch({ type: 'setPlaying', playing: true })
                }
              }}
              onToggleAppendix={() => dispatch({ type: 'toggleAppendix' })}
              onFocusRanges={(ranges) =>
                dispatch({ type: 'setHoverRanges', ranges })
              }
            />
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
              onFocusRanges={(ranges) =>
                dispatch({ type: 'setHoverRanges', ranges })
              }
            />
          </div>
        </section>
      </main>
    </div>
  )
}
