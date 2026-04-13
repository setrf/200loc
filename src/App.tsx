import { useEffect, useReducer, useRef, useState } from 'react'
import {
  createTokenizer,
  loadModelBundle,
  MicrogptRuntime,
} from './model'
import { AttentionCard } from './components/AttentionCard'
import { Appendix } from './components/Appendix'
import { CodeViewer } from './components/CodeViewer'
import { Controls } from './components/Controls'
import { NetworkTracker } from './components/NetworkTracker'
import { SegmentTabs } from './components/SegmentTabs'
import { SequenceStrip } from './components/SequenceStrip'
import { VectorBars } from './components/VectorBars'
import { useAutoplay } from './hooks/useAutoplay'
import { inferencePhases, trainingAppendix, type LineRange } from './walkthrough/phases'
import {
  initialWalkthroughState,
  walkthroughReducer,
} from './walkthrough/reducer'
import './App.css'

const phaseCount = inferencePhases.length

function formatRanges(ranges: LineRange[]) {
  return ranges
    .map((range) =>
      range.start === range.end
        ? `L${range.start}`
        : `L${range.start}-${range.end}`,
    )
    .join(', ')
}

function cardProps(
  focusRanges: (ranges: LineRange[] | null) => void,
  ranges: LineRange[],
) {
  return {
    onMouseEnter: () => focusRanges(ranges),
    onMouseLeave: () => focusRanges(null),
  }
}

export default function App() {
  const [state, dispatch] = useReducer(
    walkthroughReducer,
    initialWalkthroughState,
  )
  const [source, setSource] = useState('')
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

    if (state.activePhaseIndex < phaseCount - 1 || state.activeTraceIndex < state.traces.length - 1) {
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

  useAutoplay(state.status === 'playing', () => {
    void advance()
  }, reducedMotion ? 1800 : 1100)

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

  if (!trace || !phase || !source) {
    return (
      <div className="app-shell app-shell--centered">
        <div className="empty-state">
          <p className="eyebrow">200loc</p>
          <h1>Loading the model and canonical source…</h1>
          <p>Training is offline. The browser only fetches the exported checkpoint and `microgpt.py`.</p>
        </div>
      </div>
    )
  }

  const tokenLabel = tokenizerRef.current!.tokenLabel
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
  const activeRanges = state.hoverRanges ?? phase.codeRanges
  const canPrev = state.activePhaseIndex > 0 || state.activeTraceIndex > 0
  const canNext =
    state.activePhaseIndex < phaseCount - 1 ||
    state.activeTraceIndex < state.traces.length - 1 ||
    state.status !== 'terminal'
  const phaseNarration = phase.narration(trace, tokenLabel)
  const currentTokenLabel = tokenLabel(trace.tokenId)
  const sampledTokenLabel = tokenLabel(trace.sampledTokenId)
  const contextTokens =
    currentTokenLabel === 'BOS' && trace.positionId === 0
      ? ['BOS']
      : ['BOS', ...beforeCurrentTokens, currentTokenLabel]
  const slotLabels = contextTokens.map((token, index) => `p${index} ${token}`)
  const contextSummary = slotLabels.join(' · ')

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-header__wordmark">200loc</p>
          <h1>A 200-line GPT, explained one operation at a time.</h1>
        </div>
        <div className="app-header__meta">
          <span className={`backend-badge backend-badge--${state.backend}`}>
            {state.backend === 'webgpu' ? 'WebGPU' : 'CPU fallback'}
          </span>
          <span className="app-header__config">
            1 layer · 4 heads · 16 dim · char-level
          </span>
        </div>
      </header>

      <div className="mobile-only">
        <SegmentTabs
          activeTab={state.mobileTab}
          onChange={(tab) => dispatch({ type: 'setMobileTab', tab })}
        />
      </div>

      <main className="app-layout">
        <aside
          className={`app-code-pane ${
            state.mobileTab === 'code' ? 'is-active' : ''
          }`}
        >
          <CodeViewer source={source} activeRanges={activeRanges} />
        </aside>

        <section className="app-main-pane">
          {state.mobileTab !== 'code' ? (
            <NetworkTracker
              phases={inferencePhases}
              activePhaseIndex={state.activePhaseIndex}
              contextTokens={contextTokens}
              tokenPosition={trace.positionId}
              sampledToken={sampledTokenLabel}
              onFocusRanges={(ranges) =>
                dispatch({ type: 'setHoverRanges', ranges })
              }
            />
          ) : null}

          <div
            className={`story-pane ${
              state.mobileTab === 'story' ? 'is-active' : ''
            }`}
          >
            <Controls
              prefix={state.prefixInput}
              normalization={state.normalization}
              backend={state.backend}
              fallbackReason={state.fallbackReason}
              phaseTitle={phase.title}
              currentToken={currentTokenLabel}
              tokenPosition={trace.positionId}
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
            />

            <section className="panel phase-panel">
              <p className="eyebrow">What happens now</p>
              <h2>{phase.title}</h2>
              <p>
                Reading <strong>p{trace.positionId}:{currentTokenLabel}</strong>{' '}
                from {contextSummary} to predict <strong>p{trace.positionId + 1}</strong>.
              </p>
              <p>{phaseNarration.lead}</p>
              <p className="phase-panel__why">{phaseNarration.why}</p>
              <p className="phase-panel__code">
                Code lines {formatRanges(phase.codeRanges)}
              </p>
            </section>

            <Appendix
              open={state.appendixOpen}
              sections={trainingAppendix}
              onToggle={() => dispatch({ type: 'toggleAppendix' })}
              onFocusRanges={(ranges) =>
                dispatch({ type: 'setHoverRanges', ranges })
              }
            />
          </div>

          <div
            className={`viz-pane ${
              state.mobileTab === 'viz' ? 'is-active' : ''
            }`}
          >
            <SequenceStrip
              contextTokens={contextTokens}
              currentPosition={trace.positionId}
              sampledToken={sampledTokenLabel}
              terminal={sampledTokenLabel === 'BOS'}
            />

            <div className="viz-grid">
              <article
                className="panel token-card"
                {...cardProps(
                  (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                  inferencePhases[0].codeRanges,
                )}
              >
                <p className="eyebrow">Current token</p>
                <h2>
                  Reading p{trace.positionId}:{currentTokenLabel}
                </h2>
                <p>Visible slots {contextSummary}</p>
                <div className="token-card__facts">
                  <span>token id {trace.tokenId}</span>
                  <span>position {trace.positionId}</span>
                  <span>
                    predicting p{trace.positionId + 1}:{sampledTokenLabel}
                  </span>
                </div>
              </article>

              <article
                className="panel"
                {...cardProps(
                  (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                  [
                    ...inferencePhases[1].codeRanges,
                    ...inferencePhases[2].codeRanges,
                    ...inferencePhases[3].codeRanges,
                  ],
                )}
              >
                <div className="panel__header">
                  <div>
                    <p className="eyebrow">Embeddings</p>
                    <h2>
                      How p{trace.positionId}:{currentTokenLabel} becomes a vector
                    </h2>
                  </div>
                </div>
                <VectorBars
                  values={trace.tokenEmbedding}
                  limit={8}
                  label={`token vector for ${currentTokenLabel}`}
                  compact
                />
                <VectorBars
                  values={trace.positionEmbedding}
                  limit={8}
                  label={`position vector for p${trace.positionId}`}
                  compact
                />
                <VectorBars
                  values={trace.xAfterNorm}
                  limit={8}
                  label="combined input stream"
                  compact
                />
              </article>

              {(phase.id === 'qkv' ||
                phase.id === 'attention-scores' ||
                phase.id === 'attention-softmax' ||
                phase.id === 'weighted-values' ||
                phase.id === 'attn-out') && (
                <div
                  {...cardProps(
                    (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                    [
                      ...inferencePhases[4].codeRanges,
                      ...inferencePhases[5].codeRanges,
                      ...inferencePhases[6].codeRanges,
                      ...inferencePhases[7].codeRanges,
                      ...inferencePhases[8].codeRanges,
                    ],
                  )}
                >
                  <AttentionCard
                    heads={trace.heads}
                    slotLabels={slotLabels}
                    currentToken={currentTokenLabel}
                    currentPosition={trace.positionId}
                  />
                </div>
              )}

              {(phase.id === 'attn-out' || phase.id === 'mlp') && (
                <article
                  className="panel"
                  {...cardProps(
                    (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                    [
                      ...inferencePhases[8].codeRanges,
                      ...inferencePhases[9].codeRanges,
                    ],
                  )}
                >
                  <div className="panel__header">
                    <div>
                      <p className="eyebrow">Residual / MLP</p>
                      <h2>
                        Update the state of p{trace.positionId}:{currentTokenLabel}
                      </h2>
                    </div>
                  </div>
                  <VectorBars values={trace.attnOutput} limit={8} label="attention write-back" compact />
                  <VectorBars values={trace.xAfterAttnResidual} limit={8} label="state after write-back" compact />
                  <VectorBars values={trace.mlpHidden} limit={8} label="mlp hidden activations" compact />
                  <VectorBars values={trace.xAfterMlpResidual} limit={8} label="final state for this slot" compact />
                </article>
              )}

              {(phase.id === 'lm-head' || phase.id === 'probabilities') && (
                <article
                  className="panel logits-card"
                  {...cardProps(
                    (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                    [
                      ...inferencePhases[10].codeRanges,
                      ...inferencePhases[11].codeRanges,
                    ],
                  )}
                >
                  <div className="panel__header">
                    <div>
                      <p className="eyebrow">Next token</p>
                      <h2>Best guesses for p{trace.positionId + 1}</h2>
                    </div>
                  </div>
                  <div className="logits-card__list">
                    {trace.topCandidates.map((candidate) => (
                      <div className="logits-card__row" key={candidate.tokenId}>
                        <span>{tokenLabel(candidate.tokenId)}</span>
                        <div className="logits-card__track">
                          <div
                            className="logits-card__fill"
                            style={{ width: `${candidate.probability * 100}%` }}
                          />
                        </div>
                        <span>{(candidate.probability * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </article>
              )}

              {(phase.id === 'sample' || phase.id === 'append-or-stop') && (
                <article
                  className="panel sample-card"
                  {...cardProps(
                    (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                    [
                      ...inferencePhases[12].codeRanges,
                      ...inferencePhases[13].codeRanges,
                    ],
                  )}
                >
                  <p className="eyebrow">Sampling</p>
                  <h2>
                    p{trace.positionId + 1}:{sampledTokenLabel}
                  </h2>
                  <p>
                    {sampledTokenLabel === 'BOS'
                      ? 'BOS means the model emitted the stop token and ends generation.'
                      : `The model sampled ${sampledTokenLabel}. That value is appended as the next visible slot.`}
                  </p>
                  <p className="sample-card__note">
                    Fixed temperature 0.5, deterministic seed, one token at a time.
                  </p>
                </article>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
