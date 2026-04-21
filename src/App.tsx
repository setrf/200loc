import { useAppShellController } from './app/useAppShellController'
import { useWalkthroughController, phaseCount } from './app/useWalkthroughController'
import {
  buildWalkthroughViewModel,
} from './app/walkthroughViewModel'
import { AppHeader } from './components/AppHeader'
import { IntroWalkthrough } from './components/IntroWalkthrough'
import { LabTourOverlay } from './components/LabTourOverlay'
import { ProjectInfoDialog } from './components/ProjectInfoDialog'
import { SegmentTabs } from './components/SegmentTabs'
import { WalkthroughControls } from './components/WalkthroughControls'
import { WalkthroughLayout } from './components/WalkthroughLayout'
import { introSteps } from './intro/steps'
import { inferencePhases } from './walkthrough/phases'
import './App.css'

export default function App() {
  const {
    advance,
    dispatch,
    handleFocusRanges,
    handlePrefixChange,
    hydrate,
    sceneModelData,
    source,
    state,
    tokenizer,
  } = useWalkthroughController()
  const {
    activeLabTourStepIndex,
    appMode,
    collapsedPanels,
    finishLabTour,
    introStepIndex,
    isCompact,
    labTourSteps,
    openLab,
    reopenIntro,
    setIntroStepIndex,
    setLabTourStepIndex,
    setShowProjectInfo,
    showLabTour,
    showProjectInfo,
    startLabTour,
    togglePanel,
  } = useAppShellController({
    dispatch,
    mobileTab: state.mobileTab,
    walkthroughStatus: state.status,
  })

  const trace = state.traces[state.activeTraceIndex]
  const phase = inferencePhases[state.activePhaseIndex]

  if (appMode === 'intro') {
    return (
      <div className="app-shell app-shell--intro">
        <IntroWalkthrough
          activeStepIndex={introStepIndex}
          steps={introSteps}
          onBack={() => {
            setIntroStepIndex((currentIndex) => Math.max(0, currentIndex - 1))
          }}
          onNext={() => {
            setIntroStepIndex((currentIndex) =>
              Math.min(introSteps.length - 1, currentIndex + 1),
            )
          }}
          onSkip={openLab}
          onOpenLab={openLab}
        />
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="app-shell app-shell--centered">
        <div className="empty-state">
          <p className="eyebrow">200loc</p>
          <h1>Failed to load the walkthrough.</h1>
          <p>{state.error}</p>
        </div>
      </div>
    )
  }

  if (!trace || !phase || !source || !sceneModelData || !tokenizer) {
    return (
      <div className="app-shell app-shell--centered">
        <div className="empty-state">
          <p className="eyebrow">200loc</p>
          <h1>Loading the model and canonical source…</h1>
          <p>
            Training is offline. The browser only fetches the exported checkpoint
            and `microgpt.py`.
          </p>
        </div>
      </div>
    )
  }

  const tokenLabel = tokenizer.tokenLabel
  const currentText = tokenizer.decode(state.sequenceTokenIds)
  const viewModel = buildWalkthroughViewModel({
    collapsedPanels,
    isCompact,
    phase,
    phaseCount,
    state,
    tokenLabel,
    trace,
  })
  const {
    activeRanges,
    canNext,
    canPrev,
    contextTokens,
    controlsLocked,
    currentTextStatus,
    hasPendingPrefixChange,
    layoutStyle,
    navigationBlocked,
  } = viewModel

  const controlsPanelContent = (
    <WalkthroughControls
      activePhaseIndex={state.activePhaseIndex}
      canNext={canNext}
      canPrev={canPrev}
      controlsLocked={controlsLocked}
      currentText={currentText}
      currentTextStatus={currentTextStatus}
      hasPendingPrefixChange={hasPendingPrefixChange}
      isPlaying={state.status === 'playing'}
      navigationBlocked={navigationBlocked}
      onApplyPrefix={() => {
        dispatch({ type: 'setPlaying', playing: false })
        void hydrate(state.prefixInput)
      }}
      onFocusRanges={handleFocusRanges}
      onNext={() => {
        dispatch({ type: 'setPlaying', playing: false })
        void advance()
      }}
      onPlayToggle={() => {
        if (state.status === 'playing') {
          dispatch({ type: 'setPlaying', playing: false })
        } else {
          dispatch({ type: 'setPlaying', playing: true })
        }
      }}
      onPrefixChange={handlePrefixChange}
      onPrev={() => {
        dispatch({ type: 'setPlaying', playing: false })
        dispatch({ type: 'phasePrev', phaseCount })
      }}
      phase={phase}
      phaseCount={phaseCount}
      prefixInput={state.prefixInput}
    />
  )

  return (
    <div className="app-shell">
      <AppHeader
        onAbout={() => setShowProjectInfo(true)}
        onReopenIntro={reopenIntro}
        onStartLabTour={startLabTour}
      />

      <div className="mobile-only" data-lab-tour="tabs">
        <SegmentTabs
          activeTab={state.mobileTab}
          onChange={(tab) => dispatch({ type: 'setMobileTab', tab })}
        />
      </div>

      <WalkthroughLayout
        activeRanges={activeRanges}
        collapsedPanels={collapsedPanels}
        contextTokens={contextTokens}
        controlsPanelContent={controlsPanelContent}
        isCompact={isCompact}
        layoutStyle={layoutStyle}
        mobileTab={state.mobileTab}
        onFocusRanges={handleFocusRanges}
        onTogglePanel={togglePanel}
        phase={phase}
        sceneModelData={sceneModelData}
        source={source}
        tokenLabel={tokenLabel}
        trace={trace}
        viewModel={viewModel}
      />

      {showLabTour ? (
        <LabTourOverlay
          activeStepIndex={activeLabTourStepIndex}
          layoutVersion={state.mobileTab}
          steps={labTourSteps}
          onBack={() => {
            setLabTourStepIndex((currentIndex) => Math.max(0, currentIndex - 1))
          }}
          onNext={() => {
            setLabTourStepIndex((currentIndex) =>
              Math.min(labTourSteps.length - 1, currentIndex + 1),
            )
          }}
          onFinish={finishLabTour}
        />
      ) : null}

      {showProjectInfo ? (
        <ProjectInfoDialog onClose={() => setShowProjectInfo(false)} />
      ) : null}
    </div>
  )
}
