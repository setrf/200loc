import type { CSSProperties } from 'react'
import type { TokenStepTrace } from '../model'
import type { CollapsedPanels } from '../walkthrough/panels'
import type { LineRange, PhaseDefinition } from '../walkthrough/phases'
import type { WalkthroughState } from '../walkthrough/reducer'

export interface WalkthroughViewModel {
  activeRanges: LineRange[]
  canNext: boolean
  canPrev: boolean
  contextTokens: string[]
  controlsLocked: boolean
  currentTextStatus: string
  hasCollapsedPanels: boolean
  hasPendingPrefixChange: boolean
  layoutStyle?: CSSProperties
  navigationBlocked: boolean
  showCodeColumn: boolean
  showCompactStoryPanel: boolean
  showDesktopStoryPanel: boolean
  showScenePanel: boolean
  showStoryPanel: boolean
  showStoryScene: boolean
}

interface BuildWalkthroughViewModelInput {
  collapsedPanels: CollapsedPanels
  isCompact: boolean
  phase: PhaseDefinition
  phaseCount: number
  state: WalkthroughState
  tokenLabel: (tokenId: number) => string
  trace: TokenStepTrace
}

export function buildWalkthroughViewModel({
  collapsedPanels,
  isCompact,
  phase,
  phaseCount,
  state,
  tokenLabel,
  trace,
}: BuildWalkthroughViewModelInput): WalkthroughViewModel {
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
  const hasCollapsedPanels =
    collapsedPanels.code || collapsedPanels.scene || collapsedPanels.story
  const showCodeColumn =
    !collapsedPanels.code && (!isCompact || state.mobileTab === 'code')
  const showScenePanel =
    !collapsedPanels.scene && (!isCompact || state.mobileTab === 'scene')
  const showStoryPanel =
    !collapsedPanels.story && (!isCompact || state.mobileTab === 'story')
  const showDesktopStoryPanel = !isCompact && showStoryPanel
  const showCompactStoryPanel = isCompact && showStoryPanel
  const showStoryScene = isCompact ? state.mobileTab !== 'code' : showScenePanel
  const layoutStyle = isCompact
    ? undefined
    : {
        gridTemplateColumns: showCodeColumn && showScenePanel
          ? 'minmax(560px, 1fr) minmax(520px, 1fr)'
          : 'minmax(0, 1fr)',
        gridTemplateRows: showCodeColumn || showScenePanel
          ? 'auto minmax(0, 1fr)'
          : 'auto',
      }

  return {
    activeRanges,
    canNext,
    canPrev,
    contextTokens,
    controlsLocked,
    currentTextStatus,
    hasCollapsedPanels,
    hasPendingPrefixChange,
    layoutStyle,
    navigationBlocked,
    showCodeColumn,
    showCompactStoryPanel,
    showDesktopStoryPanel,
    showScenePanel,
    showStoryPanel,
    showStoryScene,
  }
}
