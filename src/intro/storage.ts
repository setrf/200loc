export const INTRO_SEEN_STORAGE_KEY = '200loc.hasSeenIntro.v1'

export function readHasSeenIntro() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(INTRO_SEEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeHasSeenIntro(seen: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (seen) {
      window.localStorage.setItem(INTRO_SEEN_STORAGE_KEY, 'true')
      return
    }

    window.localStorage.removeItem(INTRO_SEEN_STORAGE_KEY)
  } catch {
    // Ignore storage failures so the walkthrough still works in restricted browsers.
  }
}
