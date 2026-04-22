import { useEffect, useRef, type KeyboardEvent } from 'react'

interface ProjectInfoDialogProps {
  onClose: () => void
}

export function ProjectInfoDialog({ onClose }: ProjectInfoDialogProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  function getFocusableElements() {
    return Array.from(
      cardRef.current!.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    )
  }

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement
    getFocusableElements()[0]?.focus()

    return () => {
      previousFocusRef.current!.focus()
    }
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab') {
      return
    }

    const focusableElements = getFocusableElements()
    /* c8 ignore next 4 -- the dialog always renders a visible Close button */
    if (focusableElements.length === 0) {
      event.preventDefault()
      return
    }

    const firstElement = focusableElements[0]!
    const lastElement = focusableElements[focusableElements.length - 1]!

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <div
      className="project-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Project information"
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="project-splash__backdrop"
        aria-label="Close project information"
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="project-splash__card" ref={cardRef}>
        <div className="project-splash__header">
          <div>
            <p className="eyebrow">200loc</p>
            <h3>About this project</h3>
          </div>
          <button
            type="button"
            className="ghost-button ghost-button--quiet"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <p className="project-splash__summary">
          200loc shows how LLMs work end to end by using microgpt, a tiny
          complete GPT-style model. The app keeps the full Python source, model
          architecture, and every inference step synchronized on screen.
        </p>

        <div className="project-splash__section">
          <p className="project-splash__label">Links</p>
          <div className="project-splash__links">
            <a href="https://mertgulsun.com/" target="_blank" rel="noreferrer">
              mertgulsun.com
            </a>
            <a
              href="https://www.linkedin.com/in/mert-gulsun"
              target="_blank"
              rel="noreferrer"
            >
              linkedin.com/in/mert-gulsun
            </a>
            <a href="https://github.com/setrf" target="_blank" rel="noreferrer">
              github.com/setrf
            </a>
          </div>
        </div>

        <div className="project-splash__section">
          <p className="project-splash__label">Credits</p>
          <p>
            Inspired by{' '}
            <a href="https://github.com/karpathy" target="_blank" rel="noreferrer">
              Andrej Karpathy
            </a>{' '}
            and adapted from Brendan Bycroft&apos;s{' '}
            <a href="https://bbycroft.net/llm" target="_blank" rel="noreferrer">
              LLM Visualization
            </a>{' '}
            and the underlying{' '}
            <a
              href="https://github.com/bbycroft/llm-viz"
              target="_blank"
              rel="noreferrer"
            >
              llm-viz
            </a>{' '}
            project.
          </p>
        </div>

        <div className="project-splash__section">
          <p className="project-splash__label">License</p>
          <p>
            This project is released under the{' '}
            <a href="/LICENSE" target="_blank" rel="noreferrer">
              MIT License
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
