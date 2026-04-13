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
const embeddingPhaseIds = new Set([
  'tokenize',
  'token-embedding',
  'position-embedding',
  'embed-add-norm',
])
const attentionPhaseIds = new Set([
  'qkv',
  'attention-scores',
  'attention-softmax',
  'weighted-values',
])
const residualPhaseIds = new Set(['attn-out', 'mlp'])
const readoutPhaseIds = new Set(['lm-head', 'probabilities'])

type ComputationGroup =
  | 'embeddings'
  | 'attention'
  | 'residual'
  | 'readout'
  | 'sample'

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

function getComputationGroup(phaseId: string): ComputationGroup {
  if (embeddingPhaseIds.has(phaseId)) {
    return 'embeddings'
  }
  if (attentionPhaseIds.has(phaseId)) {
    return 'attention'
  }
  if (residualPhaseIds.has(phaseId)) {
    return 'residual'
  }
  if (readoutPhaseIds.has(phaseId)) {
    return 'readout'
  }
  return 'sample'
}

function getBoardCopy(
  group: ComputationGroup,
  positionId: number,
  currentTokenLabel: string,
) {
  switch (group) {
    case 'embeddings':
      return {
        eyebrow: 'Active computation',
        title: `Build the state for p${positionId}:${currentTokenLabel}`,
        lead: 'Turn the current token id and position id into the input stream that enters the layer.',
      }
    case 'attention':
      return {
        eyebrow: 'Active computation',
        title: `Read from visible slots into p${positionId}`,
        lead: 'The current slot compares itself to every visible slot before mixing back the most useful values.',
      }
    case 'residual':
      return {
        eyebrow: 'Active computation',
        title: `Update the state of p${positionId}:${currentTokenLabel}`,
        lead: 'Attention writes back first, then the MLP reshapes the slot locally before the next-token readout.',
      }
    case 'readout':
      return {
        eyebrow: 'Active computation',
        title: `Score candidates for p${positionId + 1}`,
        lead: 'Project the current slot state into vocabulary scores and normalize the strongest next-token candidates.',
      }
    case 'sample':
      return {
        eyebrow: 'Active computation',
        title: `Commit p${positionId + 1}`,
        lead: 'Draw one concrete token from the distribution, then either append it or stop on BOS.',
      }
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
  const backendStatusLabel = state.backend === 'webgpu' ? 'GPU' : 'CPU'
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
  const computationGroup = getComputationGroup(phase.id)
  const boardCopy = getBoardCopy(
    computationGroup,
    trace.positionId,
    currentTokenLabel,
  )

  return (
    <div className="app-shell">
      <header className="workbench-titlebar">
        <div className="titlebar__window-controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="titlebar__title">200loc · microgpt walkthrough</div>
        <div className="titlebar__meta">
          <span>{backendStatusLabel}</span>
          <span>{phase.title}</span>
          <span>
            p{trace.positionId}:{currentTokenLabel}
          </span>
        </div>
      </header>

      <div className="mobile-only">
        <SegmentTabs
          activeTab={state.mobileTab}
          onChange={(tab) => dispatch({ type: 'setMobileTab', tab })}
        />
      </div>

      <main className="workbench-main">
        <aside className="activity-bar" aria-label="Workbench activity">
          <button type="button" className="activity-bar__item is-active" aria-label="Explorer">
            F
          </button>
          <button type="button" className="activity-bar__item" aria-label="Search">
            S
          </button>
          <button type="button" className="activity-bar__item" aria-label="Graph">
            G
          </button>
          <button type="button" className="activity-bar__item" aria-label="Extensions">
            X
          </button>
        </aside>

        <aside className="workbench-sidebar" aria-label="Workbench sidebar">
          <div className="sidebar__section">
            <p className="sidebar__label">Explorer</p>
            <h1 className="sidebar__title">200loc</h1>
          </div>

          <div className="sidebar__group">
            <p className="sidebar__label">Open Editors</p>
            <div className="sidebar__item is-active">
              <span className="sidebar__tree">▾</span>
              <span className="sidebar__bullet" aria-hidden="true" />
              microgpt
            </div>
            <div className="sidebar__item">
              <span className="sidebar__tree">▸</span>
              walkthrough
            </div>
            <div className="sidebar__item">
              <span className="sidebar__tree">▸</span>
              weights
            </div>
          </div>

          <div className="sidebar__group">
            <p className="sidebar__label">Outline</p>
            <div className="sidebar__item">{phase.title}</div>
            <p className="sidebar__meta">
              p{trace.positionId}:{currentTokenLabel} {'->'} p{trace.positionId + 1}
              {sampledTokenLabel === 'BOS' ? ':stop' : `:${sampledTokenLabel}`}
            </p>
            <p className="sidebar__meta">Visible {contextSummary}</p>
          </div>
        </aside>

        <section className="app-main-pane">
          <aside
            className={`app-code-pane ${
              state.mobileTab === 'code' ? 'is-active' : ''
            }`}
          >
            <CodeViewer source={source} activeRanges={activeRanges} />
          </aside>

          <div
            className={`panel-area ${
              state.mobileTab === 'code' ? '' : 'is-active'
            }`}
          >
            <div className="panel-area__tabs">
              <div className="panel-area__tab is-active">Walkthrough</div>
              <div className="panel-area__tab">Problems</div>
              <div className="panel-area__tab">Output</div>
            </div>

            <div className="panel-area__content">
              <div
                className={`story-pane ${
                  state.mobileTab === 'story' ? 'is-active' : ''
                }`}
              >
                <section className="workbench-pane">
                  <div className="panel-section__header">
                    <div>
                      <p className="eyebrow">Walkthrough</p>
                      <h2>{phase.title}</h2>
                    </div>
                    <p className="panel-section__meta">{backendStatusLabel}</p>
                  </div>

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
                </section>

                <section className="workbench-pane phase-brief">
                  <div className="panel-section__header">
                    <div>
                      <p className="eyebrow">Current Phase</p>
                      <h2>{phase.title}</h2>
                    </div>
                    <p className="panel-section__meta">
                      Code lines {formatRanges(phase.codeRanges)}
                    </p>
                  </div>
                  <p className="phase-brief__summary">
                    Reading <strong>p{trace.positionId}:{currentTokenLabel}</strong>{' '}
                    from {contextSummary} to predict{' '}
                    <strong>p{trace.positionId + 1}</strong>.
                  </p>
                  <p>{phaseNarration.lead}</p>
                  <p className="phase-panel__why">{phaseNarration.why}</p>
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
                <section className="workbench-pane state-board">
                  <div className="panel-section__header">
                    <div>
                      <p className="eyebrow">State board</p>
                      <h2>
                        Reading p{trace.positionId}:{currentTokenLabel} to predict p
                        {trace.positionId + 1}:{sampledTokenLabel}
                      </h2>
                    </div>
                    <p className="panel-section__meta">
                      step {state.activePhaseIndex + 1} / {phaseCount}
                    </p>
                  </div>

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

                  <div className="state-board__grid">
                    <div
                      className="state-board__sequence"
                      {...cardProps(
                        (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                        inferencePhases[0].codeRanges,
                      )}
                    >
                      <SequenceStrip
                        contextTokens={contextTokens}
                        currentPosition={trace.positionId}
                        sampledToken={sampledTokenLabel}
                        terminal={sampledTokenLabel === 'BOS'}
                      />
                    </div>

                    <div
                      className="state-board__facts"
                      {...cardProps(
                        (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                        [
                          ...inferencePhases[0].codeRanges,
                          ...phase.codeRanges,
                        ],
                      )}
                    >
                      <p className="eyebrow">Current slot</p>
                      <h2>
                        Reading p{trace.positionId}:{currentTokenLabel}
                      </h2>
                      <p className="state-board__context">Visible slots {contextSummary}</p>
                      <div className="token-card__facts">
                        <span>token id {trace.tokenId}</span>
                        <span>position {trace.positionId}</span>
                        <span>predicting p{trace.positionId + 1}:{sampledTokenLabel}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="workbench-pane computation-board">
                  <div className="panel-section__header">
                    <div>
                      <p className="eyebrow">{boardCopy.eyebrow}</p>
                      <h2>{boardCopy.title}</h2>
                    </div>
                    <p className="computation-board__code">
                      {phase.title} · {formatRanges(phase.codeRanges)}
                    </p>
                  </div>

                  <p className="computation-board__lead">{boardCopy.lead}</p>

                  {computationGroup === 'embeddings' && (
                    <div
                      className="computation-board__body computation-board__body--embeddings"
                      {...cardProps(
                        (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                        [
                          ...inferencePhases[1].codeRanges,
                          ...inferencePhases[2].codeRanges,
                          ...inferencePhases[3].codeRanges,
                        ],
                      )}
                    >
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
                    </div>
                  )}

                  {computationGroup === 'attention' && (
                    <div
                      className="computation-board__body"
                      {...cardProps(
                        (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                        [
                          ...inferencePhases[4].codeRanges,
                          ...inferencePhases[5].codeRanges,
                          ...inferencePhases[6].codeRanges,
                          ...inferencePhases[7].codeRanges,
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

                  {computationGroup === 'residual' && (
                    <div
                      className="computation-board__body computation-board__body--residual"
                      {...cardProps(
                        (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                        [
                          ...inferencePhases[8].codeRanges,
                          ...inferencePhases[9].codeRanges,
                        ],
                      )}
                    >
                      <VectorBars values={trace.attnOutput} limit={8} label="attention write-back" compact />
                      <VectorBars values={trace.xAfterAttnResidual} limit={8} label="state after write-back" compact />
                      <VectorBars values={trace.mlpHidden} limit={8} label="mlp hidden activations" compact />
                      <VectorBars values={trace.xAfterMlpResidual} limit={8} label="final state for this slot" compact />
                    </div>
                  )}

                  {computationGroup === 'readout' && (
                    <div
                      className="computation-board__body"
                      {...cardProps(
                        (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                        [
                          ...inferencePhases[10].codeRanges,
                          ...inferencePhases[11].codeRanges,
                        ],
                      )}
                    >
                      <div className="logits-card">
                        <div className="logits-card__header">
                          <p className="eyebrow">Next token</p>
                          <h2>Best guesses for p{trace.positionId + 1}</h2>
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
                      </div>
                    </div>
                  )}

                  {computationGroup === 'sample' && (
                    <div
                      className="computation-board__body"
                      {...cardProps(
                        (ranges) => dispatch({ type: 'setHoverRanges', ranges }),
                        [
                          ...inferencePhases[12].codeRanges,
                          ...inferencePhases[13].codeRanges,
                        ],
                      )}
                    >
                      <article className="sample-card">
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
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="status-bar">
        <div className="status-bar__left">
          <span>{backendStatusLabel}</span>
          <span>{phase.title}</span>
          <span>1 layer · 4 heads · 16 dim</span>
        </div>
        <div className="status-bar__right">
          <span>{formatRanges(phase.codeRanges)}</span>
          <span>step {state.activePhaseIndex + 1} / {phaseCount}</span>
        </div>
      </footer>
    </div>
  )
}
