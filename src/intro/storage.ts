export const INTRO_STORAGE_KEY = '200loc.intro.v1'

const INTRO_COMPLETE_VALUE = 'complete'

export function readIntroCompletion() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === INTRO_COMPLETE_VALUE
  } catch {
    return false
  }
}

export function writeIntroCompletion(completed: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (completed) {
      window.localStorage.setItem(INTRO_STORAGE_KEY, INTRO_COMPLETE_VALUE)
      return
    }

    window.localStorage.removeItem(INTRO_STORAGE_KEY)
  } catch {
    // Ignore localStorage write failures so the intro still works in restricted contexts.
  }
}
