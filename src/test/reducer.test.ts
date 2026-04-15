import { describe, expect, it } from 'vitest'
import {
  initialWalkthroughState,
  walkthroughReducer,
} from '../walkthrough/reducer'

const trace = {
  tokenId: 1,
  positionId: 2,
  tokenEmbedding: [],
  positionEmbedding: [],
  xAfterEmbed: [],
  xAfterNorm: [],
  heads: [],
  attnOutput: [],
  xAfterAttnResidual: [],
  mlpHidden: [],
  mlpOutput: [],
  xAfterMlpResidual: [],
  logits: [],
  probs: [],
  sampledTokenId: 3,
  topCandidates: [],
}

describe('walkthrough reducer', () => {
  it('resets into a ready walkthrough session', () => {
    const state = walkthroughReducer(initialWalkthroughState, {
      type: 'reset',
      prefixInput: 'em',
      normalization: {
        normalized: 'em',
        removedUnsupported: false,
        truncated: false,
      },
      trace,
      sequenceTokenIds: [4, 5],
      backend: 'cpu',
      terminal: false,
    })

    expect(state.status).toBe('ready')
    expect(state.traces).toHaveLength(1)
    expect(state.activePhaseIndex).toBe(0)
  })

  it('moves through phases and trace history', () => {
    const resetState = walkthroughReducer(initialWalkthroughState, {
      type: 'reset',
      prefixInput: '',
      normalization: {
        normalized: '',
        removedUnsupported: false,
        truncated: false,
      },
      trace,
      sequenceTokenIds: [],
      backend: 'cpu',
      terminal: false,
    })

    const withSecondTrace = walkthroughReducer(resetState, {
      type: 'appendTrace',
      trace: { ...trace, positionId: 3 },
      sequenceTokenIds: [3],
      backend: 'cpu',
      terminal: false,
    })

    const movedForward = walkthroughReducer(
      {
        ...resetState,
        traces: withSecondTrace.traces,
        activeTraceIndex: 0,
        activePhaseIndex: 13,
      },
      {
        type: 'phaseNext',
        phaseCount: 14,
      },
    )

    expect(movedForward.activeTraceIndex).toBe(1)
    expect(movedForward.activePhaseIndex).toBe(0)

    const movedWithinTrace = walkthroughReducer(
      {
        ...withSecondTrace,
        activePhaseIndex: 13,
      },
      {
        type: 'phasePrev',
        phaseCount: 14,
      },
    )

    expect(movedWithinTrace.activeTraceIndex).toBe(1)
    expect(movedWithinTrace.activePhaseIndex).toBe(12)

    const movedBack = walkthroughReducer(withSecondTrace, {
      type: 'phasePrev',
      phaseCount: 14,
    })

    expect(movedBack.activeTraceIndex).toBe(0)
    expect(movedBack.activePhaseIndex).toBe(13)
  })

  it('covers the remaining reducer actions and no-op branches', () => {
    let state = walkthroughReducer(initialWalkthroughState, { type: 'loading' })
    expect(state.status).toBe('loading')

    state = walkthroughReducer(state, {
      type: 'error',
      error: 'boom',
    })
    expect(state.status).toBe('error')
    expect(state.error).toBe('boom')

    state = walkthroughReducer(state, {
      type: 'setPrefixInput',
      prefixInput: 'em',
    })
    expect(state.prefixInput).toBe('em')

    state = walkthroughReducer(state, {
      type: 'setPlaying',
      playing: true,
    })
    expect(state.status).toBe('playing')

    state = walkthroughReducer(state, {
      type: 'setHoverRanges',
      ranges: [{ start: 1, end: 2 }],
    })
    expect(state.hoverRanges).toEqual([{ start: 1, end: 2 }])

    state = walkthroughReducer(state, { type: 'toggleAppendix' })
    expect(state.appendixOpen).toBe(true)

    state = walkthroughReducer(state, {
      type: 'setMobileTab',
      tab: 'code',
    })
    expect(state.mobileTab).toBe('code')

    const atEnd = {
      ...state,
      activePhaseIndex: 13,
    }
    const noOpNext = walkthroughReducer(
      atEnd,
      {
      type: 'phaseNext',
      phaseCount: 14,
      },
    )
    expect(noOpNext).toBe(atEnd)

    const atBeginning = {
      ...state,
      activePhaseIndex: 0,
      activeTraceIndex: 0,
    }
    const noOpPrev = walkthroughReducer(
      atBeginning,
      {
      type: 'phasePrev',
      phaseCount: 14,
      },
    )
    expect(noOpPrev).toBe(atBeginning)
  })

  it('treats structurally equal hover ranges as unchanged', () => {
    const state = {
      ...initialWalkthroughState,
      status: 'ready' as const,
      hoverRanges: [{ start: 1, end: 2 }],
    }

    const nextState = walkthroughReducer(state, {
      type: 'setHoverRanges',
      ranges: [{ start: 1, end: 2 }],
    })

    expect(nextState).toBe(state)
  })

  it('marks reset and append as terminal when requested', () => {
    const resetTerminal = walkthroughReducer(initialWalkthroughState, {
      type: 'reset',
      prefixInput: '',
      normalization: {
        normalized: '',
        removedUnsupported: false,
        truncated: false,
      },
      trace,
      sequenceTokenIds: [],
      backend: 'cpu',
      terminal: true,
    })
    expect(resetTerminal.status).toBe('terminal')

    const appendedTerminal = walkthroughReducer(resetTerminal, {
      type: 'appendTrace',
      trace,
      sequenceTokenIds: [],
      backend: 'cpu',
      terminal: true,
    })
    expect(appendedTerminal.status).toBe('terminal')
  })
})
