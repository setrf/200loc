import type { CSSProperties, ReactNode } from 'react'
import type { TokenStepTrace } from '../model'
import type { CollapsedPanels, PanelKey } from '../walkthrough/panels'
import {
  getCodeExplainerText,
  type LineRange,
  type PhaseDefinition,
} from '../walkthrough/phases'
import type { MobileTab } from '../walkthrough/reducer'
import { getPhaseTheme } from '../walkthrough/phaseTheme'
import type { SceneModelData } from '../viz/llmViz/types'
import { ArchitectureScene } from './ArchitectureScene'
import { CodeViewer } from './CodeViewer'
import { Controls } from './Controls'
import { PanelDock } from './PanelDock'

interface WalkthroughLayoutViewModel {
  hasCollapsedPanels: boolean
  showCodeColumn: boolean
  showCompactStoryPanel: boolean
  showDesktopStoryPanel: boolean
  showScenePanel: boolean
  showStoryScene: boolean
}

interface WalkthroughLayoutProps {
  activePhaseIndex: number
  activeRanges: LineRange[]
  collapsedPanels: CollapsedPanels
  contextTokens: string[]
  controlsPanelContent: ReactNode
  isCompact: boolean
  layoutStyle?: CSSProperties
  mobileTab: MobileTab
  onFocusRanges: (ranges: LineRange[] | null) => void
  onTogglePanel: (panel: PanelKey) => void
  phase: PhaseDefinition
  phaseCount: number
  sceneModelData: SceneModelData
  source: string
  tokenLabel: (tokenId: number) => string
  trace: TokenStepTrace
  viewModel: WalkthroughLayoutViewModel
}

function lineRangesMatch(left: LineRange[], right: LineRange[]) {
  return left.length === right.length && left.every((range, index) => {
    const other = right[index]
    return other != null && range.start === other.start && range.end === other.end
  })
}

export function WalkthroughLayout({
  activePhaseIndex,
  activeRanges,
  collapsedPanels,
  contextTokens,
  controlsPanelContent,
  isCompact,
  layoutStyle,
  mobileTab,
  onFocusRanges,
  onTogglePanel,
  phase,
  phaseCount,
  sceneModelData,
  source,
  tokenLabel,
  trace,
  viewModel,
}: WalkthroughLayoutProps) {
  const stepLabel = `Step ${activePhaseIndex + 1} of ${phaseCount}`
  const phaseTheme = getPhaseTheme(phase.groupId)
  const walkthroughStyle = {
    ...phaseTheme.cssVars,
    ...layoutStyle,
  }
  const codeExplainer = lineRangesMatch(activeRanges, phase.codeRanges)
    ? getCodeExplainerText(phase)
    : ''
  const stageProps = {
    'data-lab-tour': 'stage',
    'data-group-title': phase.groupTitle,
    'data-step-label': stepLabel,
    'aria-label': `Current step: ${phase.stepTitle}. Technical stage: ${phase.groupTitle}. ${stepLabel}.`,
    tabIndex: 0,
    onMouseEnter: () => onFocusRanges(phase.codeRanges),
    onMouseLeave: () => onFocusRanges(null),
    onFocus: () => onFocusRanges(phase.codeRanges),
    onBlur: () => onFocusRanges(null),
  }

  const renderHiddenPanelsDock = (className?: string) => (
    <PanelDock
      className={className}
      collapsedPanels={collapsedPanels}
      hasCollapsedPanels={viewModel.hasCollapsedPanels}
      onTogglePanel={onTogglePanel}
    />
  )

  const toolbarPanel = (
    <div className="story-scene__toolbar">
      <div className="story-scene__toolbar-main">
        {renderHiddenPanelsDock()}
      </div>
    </div>
  )

  const desktopTopPanel = !isCompact ? (
    viewModel.showDesktopStoryPanel ? (
      <section
        className={`panel-shell desktop-top-panel${
          viewModel.hasCollapsedPanels ? ' desktop-top-panel--with-dock' : ''
        }`}
      >
        <div className="desktop-top-panel__body">
          <div className="desktop-top-panel__story" data-lab-tour="story">
            <div className="desktop-top-panel__story-copy">
              <div className="panel-shell__heading" {...stageProps}>
                <span className="panel-shell__title">Current step</span>
                <span className="panel-shell__subtitle">{phase.stepTitle}</span>
              </div>
              <div id="story-panel-body" className="desktop-top-panel__story-body">
                <Controls
                  key={`desktop-${mobileTab}-${phase.stepId}-${trace.positionId}-${trace.tokenId}-${trace.sampledTokenId}`}
                  beats={phase.copy.beats}
                />
              </div>
            </div>
            <div className="desktop-top-panel__story-tools">
              {controlsPanelContent}
            </div>
          </div>

          {renderHiddenPanelsDock('panel-dock-shell--inline')}
        </div>
      </section>
    ) : viewModel.hasCollapsedPanels ? (
      <section className="panel-shell desktop-dock-panel">
        {renderHiddenPanelsDock('panel-dock-shell--compact')}
      </section>
    ) : null
  ) : null

  const storyPanel = (
    <div
      className="story-scene__story is-active"
      data-lab-tour="story"
    >
      <div className="panel-shell panel-shell--story">
        <div className="panel-shell__header">
          <div className="panel-shell__heading" {...stageProps}>
            <span className="panel-shell__title">Current step</span>
            <span className="panel-shell__subtitle">{phase.stepTitle}</span>
          </div>
          <div className="panel-shell__header-tools">
            {controlsPanelContent}
          </div>
        </div>
        <div id="story-panel-body" className="panel-shell__body">
          <Controls
            key={`${mobileTab}-${phase.stepId}-${trace.positionId}-${trace.tokenId}-${trace.sampledTokenId}`}
            beats={phase.copy.beats}
          />
        </div>
      </div>
    </div>
  )

  const compactCodeDock = isCompact && mobileTab === 'code' ? (
    renderHiddenPanelsDock('panel-dock-shell--inline')
  ) : null

  if (isCompact) {
    return (
      <main
        className="walkthrough-layout walkthrough-layout--compact"
        style={walkthroughStyle}
        data-phase-family={phaseTheme.family}
        data-phase-group={phase.groupId}
      >
        {storyPanel}

        {compactCodeDock}

        {viewModel.showCodeColumn ? (
          <div className="mobile-panel-slot">
            <aside
              className="code-column is-active code-column--compact"
              data-lab-tour="code"
            >
              <div className="code-column__sticky">
                <section className="panel-shell panel-shell--code">
                  <div className="panel-shell__header">
                    <span className="panel-shell__title">Code</span>
                    <button
                      type="button"
                      className="panel-shell__toggle"
                      onClick={() => onTogglePanel('code')}
                      aria-expanded="true"
                      aria-controls="code-panel-body"
                    >
                      Collapse
                    </button>
                  </div>
                  <div id="code-panel-body" className="panel-shell__body">
                    <CodeViewer
                      source={source}
                      activeRanges={activeRanges}
                      codeExplainer={codeExplainer}
                    />
                  </div>
                </section>
              </div>
            </aside>
          </div>
        ) : null}

        {viewModel.showScenePanel ? (
          <div
            className="story-scene__scene is-active"
            data-lab-tour="scene"
          >
            <div className="panel-shell panel-shell--scene">
              <div className="panel-shell__header">
                <span className="panel-shell__title">Model viewer</span>
                <button
                  type="button"
                  className="panel-shell__toggle"
                  onClick={() => onTogglePanel('scene')}
                  aria-expanded="true"
                  aria-controls="scene-panel-body"
                >
                  Collapse
                </button>
              </div>
              <div id="scene-panel-body" className="panel-shell__body">
                <ArchitectureScene
                  trace={trace}
                  phase={phase}
                  contextTokens={contextTokens}
                  tokenLabel={tokenLabel}
                  sceneModelData={sceneModelData}
                  onFocusRanges={onFocusRanges}
                />
              </div>
            </div>
          </div>
        ) : null}
      </main>
    )
  }

  return (
    <main
      className="walkthrough-layout"
      style={walkthroughStyle}
      data-phase-family={phaseTheme.family}
      data-phase-group={phase.groupId}
    >
      {desktopTopPanel}

      {compactCodeDock}

      {viewModel.showCodeColumn ? (
        <div className={isCompact ? 'mobile-panel-slot' : 'left-column'}>
          <aside
            className={`code-column ${
              mobileTab === 'code' ? 'is-active' : ''
            }${isCompact ? ' code-column--compact' : ''}`}
            data-lab-tour="code"
          >
            <div className="code-column__sticky">
              <section className="panel-shell panel-shell--code">
                <div className="panel-shell__header">
                  <span className="panel-shell__title">Code</span>
                  <button
                    type="button"
                    className="panel-shell__toggle"
                    onClick={() => onTogglePanel('code')}
                    aria-expanded="true"
                    aria-controls="code-panel-body"
                  >
                    Collapse
                  </button>
                </div>
                <div id="code-panel-body" className="panel-shell__body">
                  <CodeViewer
                    source={source}
                    activeRanges={activeRanges}
                    codeExplainer={codeExplainer}
                  />
                </div>
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      {viewModel.showStoryScene ? (
        <section
          className={`story-scene ${
            mobileTab === 'code' ? '' : 'is-active'
          }`}
        >
          {isCompact ? toolbarPanel : null}

          {viewModel.showScenePanel ? (
            <div
              className={`story-scene__scene ${
                mobileTab === 'scene' ? 'is-active' : ''
              }`}
              data-lab-tour="scene"
            >
              <div className="panel-shell panel-shell--scene">
                <div className="panel-shell__header">
                  <span className="panel-shell__title">Model viewer</span>
                  <button
                    type="button"
                    className="panel-shell__toggle"
                    onClick={() => onTogglePanel('scene')}
                    aria-expanded="true"
                    aria-controls="scene-panel-body"
                  >
                    Collapse
                  </button>
                </div>
                <div id="scene-panel-body" className="panel-shell__body">
                  <ArchitectureScene
                    trace={trace}
                    phase={phase}
                    contextTokens={contextTokens}
                    tokenLabel={tokenLabel}
                    sceneModelData={sceneModelData}
                    onFocusRanges={onFocusRanges}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {viewModel.showCompactStoryPanel ? storyPanel : null}
        </section>
      ) : null}
    </main>
  )
}
