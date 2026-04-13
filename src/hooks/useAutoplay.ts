import { useEffect } from 'react'

export function useAutoplay(active: boolean, step: () => void, delayMs = 1100) {
  useEffect(() => {
    if (!active) {
      return
    }

    const timer = window.setInterval(() => {
      step()
    }, delayMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [active, delayMs, step])
}
