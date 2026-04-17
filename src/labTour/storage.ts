export const LAB_TOUR_SEEN_STORAGE_KEY = '200loc.hasSeenLabTour.v1'

export function readHasSeenLabTour() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(LAB_TOUR_SEEN_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeHasSeenLabTour(seen: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    if (seen) {
      window.localStorage.setItem(LAB_TOUR_SEEN_STORAGE_KEY, 'true')
      return
    }

    window.localStorage.removeItem(LAB_TOUR_SEEN_STORAGE_KEY)
  } catch {
    // Ignore storage failures so the tour still works in restricted browsers.
  }
}
