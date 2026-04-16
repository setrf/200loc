export interface IntroState {
  activeStepIndex: number
}

export type IntroAction =
  | { type: 'next'; stepCount: number }
  | { type: 'prev' }
  | { type: 'goTo'; index: number }
  | { type: 'reset' }

export const initialIntroState: IntroState = {
  activeStepIndex: 0,
}

export function introReducer(
  state: IntroState,
  action: IntroAction,
): IntroState {
  switch (action.type) {
    case 'next':
      return {
        ...state,
        activeStepIndex: Math.min(
          action.stepCount - 1,
          state.activeStepIndex + 1,
        ),
      }
    case 'prev':
      return {
        ...state,
        activeStepIndex: Math.max(0, state.activeStepIndex - 1),
      }
    case 'goTo':
      return {
        ...state,
        activeStepIndex: Math.max(0, action.index),
      }
    case 'reset':
      return initialIntroState
  }
}
