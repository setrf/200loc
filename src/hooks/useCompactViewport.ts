import { useEffect, useState } from 'react'

export const COMPACT_QUERY = '(hover: none), (pointer: coarse), (max-width: 1023px)'

export function readCompactViewport() {
  /* c8 ignore next -- defensive fallback for non-browser evaluation */
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia(COMPACT_QUERY).matches
}

export function useCompactViewport() {
  const [isCompact, setIsCompact] = useState(readCompactViewport)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return
    }

    const media = window.matchMedia(COMPACT_QUERY)
    const update = () => setIsCompact(media.matches)
    update()
    media.addEventListener('change', update)
    return () => {
      media.removeEventListener('change', update)
    }
  }, [])

  return isCompact
}
