import { createPortal } from 'react-dom'
import {
  forwardRef,
  useId,
  useLayoutEffect,
  useState,
  type MouseEventHandler,
} from 'react'
import type { GlossaryEntry } from '../walkthrough/glossary'

interface AnnotationPopupProps {
  anchorRect?: DOMRect | null
  entry: GlossaryEntry
  mode: 'floating' | 'inline'
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
}

const VIEWPORT_GUTTER = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export const AnnotationPopup = forwardRef<HTMLDivElement, AnnotationPopupProps>(
  function AnnotationPopup(
    { anchorRect, entry, mode, onMouseEnter, onMouseLeave },
    ref,
  ) {
    const [style, setStyle] = useState<{ top: number; left: number } | null>(null)
    const popupId = useId()

    useLayoutEffect(() => {
      if (mode !== 'floating' || !anchorRect) {
        return
      }

      const element = ref && 'current' in ref ? ref.current : null
      if (!element) {
        return
      }

      const rect = element.getBoundingClientRect()
      const maxLeft = Math.max(
        VIEWPORT_GUTTER,
        window.innerWidth - rect.width - VIEWPORT_GUTTER,
      )
      const preferredLeft =
        anchorRect.left + anchorRect.width / 2 - rect.width / 2
      const left = clamp(preferredLeft, VIEWPORT_GUTTER, maxLeft)

      const fitsBelow =
        anchorRect.bottom + 14 + rect.height + VIEWPORT_GUTTER <=
        window.innerHeight
      const fitsAbove =
        anchorRect.top - 14 - rect.height - VIEWPORT_GUTTER >= 0

      let top = anchorRect.bottom + 14
      if (!fitsBelow && fitsAbove) {
        top = anchorRect.top - rect.height - 14
      }
      if (!fitsBelow && !fitsAbove) {
        top = clamp(
          anchorRect.bottom + 14,
          VIEWPORT_GUTTER,
          Math.max(VIEWPORT_GUTTER, window.innerHeight - rect.height - VIEWPORT_GUTTER),
        )
      }

      const frame = window.requestAnimationFrame(() => {
        setStyle((previous) =>
          previous?.top === top && previous.left === left ? previous : { top, left },
        )
      })

      return () => {
        window.cancelAnimationFrame(frame)
      }
    }, [anchorRect, mode, ref, entry.id])

    const card = (
      <div
        ref={ref}
        id={popupId}
        className={`annotation-popup annotation-popup--${mode}`}
        data-annotation-popup="true"
        role="dialog"
        aria-modal="false"
        aria-label={`${entry.title} explainer`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={mode === 'floating' ? style ?? { visibility: 'hidden' } : undefined}
      >
        <div className="annotation-popup__header">
          <h3 className="annotation-popup__title">{entry.title}</h3>
        </div>
        <p className="annotation-popup__summary">{entry.shortDefinition}</p>
        <div className="annotation-popup__body">
          {entry.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    )

    if (mode === 'floating') {
      return createPortal(card, document.body)
    }

    return card
  },
)
