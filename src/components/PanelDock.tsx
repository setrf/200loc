import type { CollapsedPanels, PanelKey } from '../walkthrough/panels'

interface PanelDockProps {
  className?: string
  collapsedPanels: CollapsedPanels
  hasCollapsedPanels: boolean
  onTogglePanel: (panel: PanelKey) => void
}

export function PanelDock({
  className,
  collapsedPanels,
  hasCollapsedPanels,
  onTogglePanel,
}: PanelDockProps) {
  if (!hasCollapsedPanels) {
    return null
  }

  return (
    <div
      className={`panel-dock-shell${className ? ` ${className}` : ''}`}
      role="group"
      aria-label="Hidden panels"
    >
      <div className="panel-dock panel-dock--toolbar">
        {collapsedPanels.code ? (
          <button
            type="button"
            className="panel-dock__button panel-dock__button--code"
            onClick={() => onTogglePanel('code')}
            aria-label="Expand code panel"
          >
            <span className="panel-dock__button-title">Code</span>
          </button>
        ) : null}
        {collapsedPanels.scene ? (
          <button
            type="button"
            className="panel-dock__button panel-dock__button--scene"
            onClick={() => onTogglePanel('scene')}
            aria-label="Expand model viewer panel"
          >
            <span className="panel-dock__button-title">Model viewer</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
