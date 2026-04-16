import { describe, expect, it } from 'vitest'
import {
  initialIntroState,
  introReducer,
} from '../intro/reducer'

describe('introReducer', () => {
  it('advances and clamps inside the available step count', () => {
    const next = introReducer(initialIntroState, {
      type: 'next',
      stepCount: 13,
    })
    expect(next.activeStepIndex).toBe(1)

    const clamped = introReducer(
      { activeStepIndex: 12 },
      { type: 'next', stepCount: 13 },
    )
    expect(clamped.activeStepIndex).toBe(12)
  })

  it('moves backward, jumps, and resets', () => {
    expect(
      introReducer({ activeStepIndex: 0 }, { type: 'prev' }).activeStepIndex,
    ).toBe(0)
    expect(
      introReducer({ activeStepIndex: 7 }, { type: 'prev' }).activeStepIndex,
    ).toBe(6)
    expect(
      introReducer({ activeStepIndex: 2 }, { type: 'goTo', index: 9 }).activeStepIndex,
    ).toBe(9)
    expect(
      introReducer({ activeStepIndex: 11 }, { type: 'reset' }),
    ).toEqual(initialIntroState)
  })
})
