import { useEffect, useRef } from 'react'

export function useAutoplay(active: boolean, step: () => void, delayMs = 1100) {
  const stepRef = useRef(step)

  useEffect(() => {
    stepRef.current = step
  }, [step])

  useEffect(() => {
    if (!active) {
      return
    }

    const timer = window.setInterval(() => {
      stepRef.current()
    }, delayMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [active, delayMs])
}
