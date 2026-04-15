import type { BackendName, PrefixNormalization, TokenStepTrace } from '../model'
import type { LineRange } from './phases'

export type WalkthroughStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'terminal'
  | 'error'

export type MobileTab = 'story' | 'scene' | 'code'

export interface WalkthroughState {
  status: WalkthroughStatus
  prefixInput: string
  normalization: PrefixNormalization
  traces: TokenStepTrace[]
  activeTraceIndex: number
  activePhaseIndex: number
  sequenceTokenIds: number[]
  backend: BackendName
  fallbackReason?: string
  hoverRanges: LineRange[] | null
  mobileTab: MobileTab
  error?: string
}

export type WalkthroughAction =
  | { type: 'loading' }
  | { type: 'error'; error: string }
  | {
      type: 'setPrefixInput'
      prefixInput: string
      normalization?: PrefixNormalization
    }
  | {
      type: 'reset'
      prefixInput: string
      normalization: PrefixNormalization
      trace: TokenStepTrace
      sequenceTokenIds: number[]
      backend: BackendName
      fallbackReason?: string
      terminal: boolean
    }
  | {
      type: 'appendTrace'
      trace: TokenStepTrace
      sequenceTokenIds: number[]
      backend: BackendName
      fallbackReason?: string
      terminal: boolean
    }
  | { type: 'phaseNext'; phaseCount: number }
  | { type: 'phasePrev'; phaseCount: number }
  | { type: 'setPlaying'; playing: boolean }
  | { type: 'setHoverRanges'; ranges: LineRange[] | null }
  | { type: 'setMobileTab'; tab: MobileTab }

export const initialWalkthroughState: WalkthroughState = {
  status: 'idle',
  prefixInput: '',
  normalization: {
    normalized: '',
    removedUnsupported: false,
    truncated: false,
  },
  traces: [],
  activeTraceIndex: 0,
  activePhaseIndex: 0,
  sequenceTokenIds: [],
  backend: 'cpu',
  hoverRanges: null,
  mobileTab: 'story',
}

export function walkthroughReducer(
  state: WalkthroughState,
  action: WalkthroughAction,
): WalkthroughState {
  const rangesEqual = (
    left: LineRange[] | null,
    right: LineRange[] | null,
  ) => {
    if (left === right) {
      return true
    }
    if (!left || !right || left.length !== right.length) {
      return false
    }
    return left.every(
      (range, index) =>
        range.start === right[index]?.start && range.end === right[index]?.end,
    )
  }

  switch (action.type) {
    case 'loading':
      return {
        ...state,
        status: 'loading',
        error: undefined,
      }
    case 'error':
      return {
        ...state,
        status: 'error',
        error: action.error,
      }
    case 'setPrefixInput':
      return {
        ...state,
        prefixInput: action.prefixInput,
        normalization: action.normalization ?? state.normalization,
      }
    case 'reset':
      return {
        ...state,
        status: action.terminal ? 'terminal' : 'ready',
        prefixInput: action.prefixInput,
        normalization: action.normalization,
        traces: [action.trace],
        activeTraceIndex: 0,
        activePhaseIndex: 0,
        sequenceTokenIds: action.sequenceTokenIds,
        backend: action.backend,
        fallbackReason: action.fallbackReason,
        error: undefined,
      }
    case 'appendTrace':
      return {
        ...state,
        status: action.terminal ? 'terminal' : 'ready',
        traces: [...state.traces, action.trace],
        activeTraceIndex: state.traces.length,
        activePhaseIndex: 0,
        sequenceTokenIds: action.sequenceTokenIds,
        backend: action.backend,
        fallbackReason: action.fallbackReason,
      }
    case 'phaseNext': {
      if (state.activePhaseIndex < action.phaseCount - 1) {
        return {
          ...state,
          activePhaseIndex: state.activePhaseIndex + 1,
        }
      }
      if (state.activeTraceIndex < state.traces.length - 1) {
        return {
          ...state,
          activeTraceIndex: state.activeTraceIndex + 1,
          activePhaseIndex: 0,
        }
      }
      return state
    }
    case 'phasePrev': {
      if (state.activePhaseIndex > 0) {
        return {
          ...state,
          activePhaseIndex: state.activePhaseIndex - 1,
        }
      }
      if (state.activeTraceIndex > 0) {
        return {
          ...state,
          activeTraceIndex: state.activeTraceIndex - 1,
          activePhaseIndex: action.phaseCount - 1,
        }
      }
      return state
    }
    case 'setPlaying':
      return {
        ...state,
        status: action.playing ? 'playing' : 'paused',
      }
    case 'setHoverRanges':
      if (rangesEqual(state.hoverRanges, action.ranges)) {
        return state
      }
      return {
        ...state,
        hoverRanges: action.ranges,
      }
    case 'setMobileTab':
      return {
        ...state,
        mobileTab: action.tab,
      }
  }
}
