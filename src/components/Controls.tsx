import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { getGlossaryEntry, type GlossaryId } from '../walkthrough/glossary'
import type { StoryBeat } from '../walkthrough/phases'
import { AnnotationPopup } from './AnnotationPopup'

interface ControlsProps {
  beats: StoryBeat[]
}

interface OpenAnnotation {
  anchorRect: DOMRect
  glossaryId: GlossaryId
  pinned: boolean
  triggerKey: string
}

const HOVER_OPEN_DELAY_MS = 280
const HOVER_CLOSE_DELAY_MS = 140
const COMPACT_QUERY = '(hover: none), (pointer: coarse), (max-width: 960px)'

function isCompactViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia(COMPACT_QUERY).matches
}

export function Controls({ beats }: ControlsProps) {
  const [isCompact, setIsCompact] = useState(isCompactViewport)
  const [openAnnotation, setOpenAnnotation] = useState<OpenAnnotation | null>(
    null,
  )
  const popupRef = useRef<HTMLDivElement | null>(null)
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const hoverTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

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

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const closeAnnotation = useCallback(() => {
    clearHoverTimer()
    clearCloseTimer()
    setOpenAnnotation(null)
  }, [clearCloseTimer, clearHoverTimer])

  function syncAnnotation(triggerKey: string, glossaryId: GlossaryId, pinned: boolean) {
    const trigger = triggerRefs.current.get(triggerKey)
    if (!trigger) {
      return
    }

    const anchorRect = trigger.getBoundingClientRect()
    setOpenAnnotation((current) => {
      if (current?.triggerKey === triggerKey) {
        return {
          ...current,
          anchorRect,
          glossaryId,
          pinned: current.pinned || pinned,
        }
      }

      return {
        anchorRect,
        glossaryId,
        pinned,
        triggerKey,
      }
    })
  }

  function scheduleHoverOpen(triggerKey: string, glossaryId: GlossaryId) {
    clearHoverTimer()
    hoverTimerRef.current = window.setTimeout(() => {
      syncAnnotation(triggerKey, glossaryId, false)
      hoverTimerRef.current = null
    }, HOVER_OPEN_DELAY_MS)
  }

  function scheduleClose() {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setOpenAnnotation((current) => (current?.pinned ? current : null))
      closeTimerRef.current = null
    }, HOVER_CLOSE_DELAY_MS)
  }

  useEffect(() => {
    if (!openAnnotation || isCompact) {
      return
    }

    const updatePosition = () => {
      const trigger = triggerRefs.current.get(openAnnotation.triggerKey)
      if (!trigger) {
        setOpenAnnotation(null)
        return
      }
      const anchorRect = trigger.getBoundingClientRect()
      setOpenAnnotation((current) =>
        current
          ? {
              ...current,
              anchorRect,
            }
          : current,
      )
    }

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isCompact, openAnnotation])

  useEffect(() => {
    if (!openAnnotation) {
      return
    }

    const handlePointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target as Node

      const triggerNodes = [...triggerRefs.current.values()]
      if (popupRef.current?.contains(target)) {
        return
      }
      if (triggerNodes.some((node) => node.contains(target))) {
        return
      }

      closeAnnotation()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAnnotation()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeAnnotation, openAnnotation])

  const openEntry = openAnnotation
    ? getGlossaryEntry(openAnnotation.glossaryId)
    : null

  function handleTriggerMouseEnter(triggerKey: string, glossaryId: GlossaryId) {
    if (isCompact) {
      return
    }
    clearCloseTimer()
    scheduleHoverOpen(triggerKey, glossaryId)
  }

  function handleTriggerMouseLeave() {
    if (isCompact) {
      return
    }
    clearHoverTimer()
    scheduleClose()
  }

  function handleTriggerClick(
    event: MouseEvent<HTMLButtonElement>,
    triggerKey: string,
    glossaryId: GlossaryId,
  ) {
    event.preventDefault()
    clearHoverTimer()
    clearCloseTimer()
    const anchorRect = event.currentTarget.getBoundingClientRect()

    if (isCompact) {
      setOpenAnnotation((current) =>
        current?.triggerKey === triggerKey
          ? null
          : {
              anchorRect,
              glossaryId,
              pinned: false,
              triggerKey,
            },
      )
      return
    }

    setOpenAnnotation((current) => {
      if (current?.triggerKey === triggerKey) {
        if (current.pinned) {
          return null
        }
        return {
          ...current,
          anchorRect,
          glossaryId,
          pinned: true,
        }
      }

      return {
        anchorRect,
        glossaryId,
        pinned: true,
        triggerKey,
      }
    })
  }

  function registerTrigger(triggerKey: string, node: HTMLButtonElement | null) {
    if (node) {
      triggerRefs.current.set(triggerKey, node)
      return
    }
    triggerRefs.current.delete(triggerKey)
  }

  return (
    <div className="story-panel">
      <section className="story-panel__lesson" aria-label="Step explanation">
        <p className="story-panel__flow">
          {beats.map((beat, beatIndex) => (
            <span
              key={`${beat.kind}-${beatIndex}`}
              className={`story-panel__inline-beat story-panel__inline-beat--${beat.kind}`}
              data-kind={beat.kind}
            >
              <span
                className={
                  beatIndex === 0
                    ? 'story-panel__summary'
                    : 'story-panel__paragraph'
                }
              >
                {beat.segments.map((segment, segmentIndex) => {
                  if (segment.kind === 'text') {
                    return (
                      <span key={`${beat.kind}-${beatIndex}-${segmentIndex}`}>
                        {segment.text}
                      </span>
                    )
                  }

                  const triggerKey = `${beatIndex}-${segmentIndex}-${segment.glossaryId}`
                  const isOpen = openAnnotation?.triggerKey === triggerKey

                  return (
                    <button
                      key={triggerKey}
                      ref={(node) => registerTrigger(triggerKey, node)}
                      type="button"
                      className="annotation-trigger"
                      data-annotation-trigger="true"
                      data-glossary-id={segment.glossaryId}
                      aria-haspopup="dialog"
                      aria-expanded={isOpen ? 'true' : 'false'}
                      onMouseEnter={() =>
                        handleTriggerMouseEnter(triggerKey, segment.glossaryId)
                      }
                      onMouseLeave={handleTriggerMouseLeave}
                      onClick={(event) =>
                        handleTriggerClick(event, triggerKey, segment.glossaryId)
                      }
                    >
                      {segment.text}
                    </button>
                  )
                })}
              </span>
              {beatIndex < beats.length - 1 ? ' ' : null}
            </span>
          ))}
        </p>

        {isCompact && openEntry ? (
          <AnnotationPopup
            ref={popupRef}
            entry={openEntry}
            mode="inline"
          />
        ) : null}
      </section>

      {!isCompact && openEntry && openAnnotation ? (
        <AnnotationPopup
          ref={popupRef}
          anchorRect={openAnnotation.anchorRect}
          entry={openEntry}
          mode="floating"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
        />
      ) : null}
    </div>
  )
}
