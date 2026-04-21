import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useCompactViewport } from '../hooks/useCompactViewport'
import type {
  IntroLineSegment,
  IntroStepDefinition,
} from '../intro/steps'
import { getGlossaryEntry, type GlossaryId } from '../walkthrough/glossary'
import { AnnotationPopup } from './AnnotationPopup'

interface IntroWalkthroughProps {
  activeStepIndex: number
  steps: IntroStepDefinition[]
  onBack: () => void
  onNext: () => void
  onSkip: () => void
  onOpenLab: () => void
}

interface OpenAnnotation {
  anchorRect: DOMRect
  glossaryId: GlossaryId
  pinned: boolean
  triggerKey: string
}

const HOVER_OPEN_DELAY_MS = 280
const HOVER_CLOSE_DELAY_MS = 140

export function IntroWalkthrough({
  activeStepIndex,
  steps,
  onBack,
  onNext,
  onSkip,
  onOpenLab,
}: IntroWalkthroughProps) {
  const step = steps[activeStepIndex]!
  const isFirst = activeStepIndex === 0
  const isLast = activeStepIndex === steps.length - 1
  const isCompact = useCompactViewport()
  const [openAnnotation, setOpenAnnotation] = useState<OpenAnnotation | null>(
    null,
  )
  const popupRef = useRef<HTMLDivElement | null>(null)
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const hoverTimerRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

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

  useEffect(() => {
    const handle = window.setTimeout(() => {
      closeAnnotation()
    }, 0)
    return () => window.clearTimeout(handle)
  }, [activeStepIndex, closeAnnotation])

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

  function renderSegment(segment: IntroLineSegment, lineIndex: number, segmentIndex: number) {
    if (segment.kind === 'text') {
      return <span key={`${step.id}-${lineIndex}-${segmentIndex}`}>{segment.text}</span>
    }

    const triggerKey = `${step.id}-${lineIndex}-${segmentIndex}-${segment.glossaryId}`
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
        onMouseEnter={() => handleTriggerMouseEnter(triggerKey, segment.glossaryId)}
        onMouseLeave={handleTriggerMouseLeave}
        onClick={(event) =>
          handleTriggerClick(event, triggerKey, segment.glossaryId)
        }
      >
        {segment.text}
      </button>
    )
  }

  return (
    <div className="intro-shell">
      <header className="intro-shell__header">
        <div>
          <p className="eyebrow">200loc</p>
          <h1>How LLM systems actually work</h1>
        </div>
        <button
          type="button"
          className="ghost-button ghost-button--quiet"
          onClick={onSkip}
        >
          Skip
        </button>
      </header>

      <main className="intro-stack">
        <section className="intro-step" aria-label="Intro step">
          <div className="intro-step__lines">
            {step.lines.map((line, lineIndex) => (
              <p className="intro-step__line" key={`${step.id}-${lineIndex}`}>
                {line.segments.map((segment, segmentIndex) =>
                  renderSegment(segment, lineIndex, segmentIndex),
                )}
              </p>
            ))}
          </div>
          {isCompact && openEntry ? (
            <AnnotationPopup ref={popupRef} entry={openEntry} mode="inline" />
          ) : null}
        </section>

        <section className="intro-actions" aria-label="Intro navigation">
          <div className="intro-actions__group">
            <button
              type="button"
              className="intro-button intro-button--secondary"
              onClick={onBack}
              disabled={isFirst}
            >
              Back
            </button>
            {isLast ? (
              <button
                type="button"
                className="intro-button intro-button--primary"
                onClick={onOpenLab}
              >
                Open live walkthrough
              </button>
            ) : (
              <button
                type="button"
                className="intro-button intro-button--primary"
                onClick={onNext}
              >
                Next
              </button>
            )}
          </div>
        </section>
      </main>

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
