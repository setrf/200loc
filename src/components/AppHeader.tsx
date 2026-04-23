interface AppHeaderProps {
  onAbout: () => void
  onReopenIntro: () => void
  onStartLabTour: () => void
}

export function AppHeader({
  onAbout,
  onReopenIntro,
  onStartLabTour,
}: AppHeaderProps) {
  return (
    <header className="app-header" data-lab-tour="header">
      <div>
        <p className="eyebrow">200loc</p>
        <h2 className="app-header__title">A complete tiny LLM, step by step</h2>
      </div>
      <div className="app-header__actions">
        <button
          type="button"
          className="ghost-button ghost-button--quiet"
          onClick={onAbout}
        >
          About
        </button>
        <button
          type="button"
          className="ghost-button ghost-button--quiet"
          onClick={onStartLabTour}
        >
          Show lab tour
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={onReopenIntro}
        >
          Start intro again
        </button>
      </div>
    </header>
  )
}
