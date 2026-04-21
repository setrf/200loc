import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
} from 'react'
import { useCompactViewport } from '../hooks/useCompactViewport'
import { readHasSeenIntro, writeHasSeenIntro } from '../intro/storage'
import {
  desktopLabTourSteps,
  mobileLabTourSteps,
} from '../labTour/steps'
import {
  readHasSeenLabTour,
  writeHasSeenLabTour,
} from '../labTour/storage'
import type {
  MobileTab,
  WalkthroughAction,
  WalkthroughStatus,
} from '../walkthrough/reducer'
import type { CollapsedPanels, PanelKey } from '../walkthrough/panels'

export type AppMode = 'intro' | 'lab'

interface UseAppShellControllerInput {
  dispatch: Dispatch<WalkthroughAction>
  mobileTab: MobileTab
  walkthroughStatus: WalkthroughStatus
}

export function useAppShellController({
  dispatch,
  mobileTab,
  walkthroughStatus,
}: UseAppShellControllerInput) {
  const hasSeenIntro = readHasSeenIntro()
  const [appMode, setAppMode] = useState<AppMode>(() => (hasSeenIntro ? 'lab' : 'intro'))
  const [introStepIndex, setIntroStepIndex] = useState(0)
  const isCompact = useCompactViewport()
  const [showLabTour, setShowLabTour] = useState(
    () => hasSeenIntro && !readHasSeenLabTour(),
  )
  const [showProjectInfo, setShowProjectInfo] = useState(false)
  const [labTourStepIndex, setLabTourStepIndex] = useState(0)
  const [collapsedPanels, setCollapsedPanels] = useState<CollapsedPanels>({
    code: false,
    scene: false,
    story: false,
  })
  const labTourSteps = useMemo(
    () => (isCompact ? mobileLabTourSteps : desktopLabTourSteps),
    [isCompact],
  )
  const activeLabTourStepIndex = Math.min(
    labTourStepIndex,
    labTourSteps.length - 1,
  )

  const togglePanel = useCallback((panel: PanelKey) => {
    setCollapsedPanels((current) => ({
      ...current,
      [panel]: !current[panel],
    }))
  }, [])

  useEffect(() => {
    if (!showProjectInfo) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowProjectInfo(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showProjectInfo])

  function openLab() {
    writeHasSeenIntro(true)
    setAppMode('lab')
    if (!readHasSeenLabTour()) {
      setLabTourStepIndex(0)
      setShowLabTour(true)
      return
    }

    setShowLabTour(false)
  }

  function reopenIntro() {
    setShowLabTour(false)
    setIntroStepIndex(0)
    setAppMode('intro')
  }

  function startLabTour() {
    if (walkthroughStatus === 'playing') {
      dispatch({ type: 'setPlaying', playing: false })
    }
    setLabTourStepIndex(0)
    setShowLabTour(true)
  }

  function finishLabTour() {
    writeHasSeenLabTour(true)
    setShowLabTour(false)
  }

  useEffect(() => {
    if (!showLabTour) {
      return
    }

    const currentTourStep = labTourSteps[activeLabTourStepIndex]
    if (currentTourStep?.mobileTab && mobileTab !== currentTourStep.mobileTab) {
      dispatch({ type: 'setMobileTab', tab: currentTourStep.mobileTab })
    }
  }, [
    activeLabTourStepIndex,
    dispatch,
    labTourSteps,
    mobileTab,
    showLabTour,
  ])

  return {
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
  }
}
