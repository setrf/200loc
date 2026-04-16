import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Tokenizer } from '../model/tokenizer'
import { ArchitectureScene } from './ArchitectureScene'
import { CodeViewer } from './CodeViewer'
import { Controls } from './Controls'
import { SegmentTabs } from './SegmentTabs'
import { useAutoplay } from '../hooks/useAutoplay'
import { inferencePhases, type LineRange } from '../walkthrough/phases'
import type { WalkthroughState } from '../walkthrough/reducer'
import type { SceneModelData } from '../viz/llmViz/types'

const phaseCount = inferencePhases.length

export interface WalkthroughShellProps {
  state: WalkthroughState
  source: string
  tokenizer: Tokenizer
  sceneModelData: SceneModelData
  onFocusRanges: (ranges: LineRange[] | null) => void
  onPrefixChange: (value: string) => void
  onHydrate: (prefixInput: string) => Promise<void>
  onAdvance: () => Promise<void>
  onSetPlaying: (playing: boolean) => void
  onPhasePrev: () => void
  onSetMobileTab: (tab: WalkthroughState['mobileTab']) => void
}

function useReducedMotionPreference() {
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

  return reducedMotion
}

export function WalkthroughShell({
  state,
  source,
  tokenizer,
  sceneModelData,
  onFocusRanges,
  onPrefixChange,
  onHydrate,
  onAdvance,
  onSetPlaying,
  onPhasePrev,
  onSetMobileTab,
}: WalkthroughShellProps) {
  const reducedMotion = useReducedMotionPreference()
  const trace = state.traces[state.activeTraceIndex]
  const phase = inferencePhases[state.activePhaseIndex]

  const tokenLabel = tokenizer.tokenLabel
  const currentText = tokenizer.decode(state.sequenceTokenIds)
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

  const handleAutoplayTick = useCallback(() => {
    void onAdvance()
  }, [onAdvance])

  useAutoplay(
    state.status === 'playing',
    handleAutoplayTick,
    reducedMotion ? 1800 : 1100,
  )

  const controlsKey = useMemo(
    () =>
      `${state.mobileTab}-${phase.stepId}-${trace.positionId}-${trace.tokenId}-${trace.sampledTokenId}`,
    [
      phase.stepId,
      state.mobileTab,
      trace.positionId,
      trace.sampledTokenId,
      trace.tokenId,
    ],
  )

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">200loc</p>
          <h2 className="app-header__title">How LLM systems actually work</h2>
        </div>
      </header>

      <div className="mobile-only">
        <SegmentTabs
          activeTab={state.mobileTab}
          onChange={onSetMobileTab}
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
                onMouseEnter={() => onFocusRanges(phase.codeRanges)}
                onMouseLeave={() => onFocusRanges(null)}
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
                      onChange={(event) => onPrefixChange(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !controlsLocked) {
                          onSetPlaying(false)
                          void onHydrate(state.prefixInput)
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
                        onSetPlaying(false)
                        void onHydrate(state.prefixInput)
                      }}
                      disabled={controlsLocked}
                    >
                      {hasPendingPrefixChange ? 'Apply text' : 'Reset'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetPlaying(false)
                        onPhasePrev()
                      }}
                      disabled={!canPrev || navigationBlocked}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetPlaying(false)
                        void onAdvance()
                      }}
                      disabled={!canNext || navigationBlocked}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSetPlaying(state.status !== 'playing')
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
              onFocusRanges={onFocusRanges}
            />
          </div>

          <div
            className={`story-scene__story ${
              state.mobileTab === 'story' ? 'is-active' : ''
            }`}
          >
            <Controls
              key={controlsKey}
              beats={phase.copy.beats}
            />
          </div>
        </section>
      </main>
    </div>
  )
}
