import type { CSSProperties, ReactNode } from 'react'
import type { TokenStepTrace } from '../model'
import type { CollapsedPanels, PanelKey } from '../walkthrough/panels'
import type { LineRange, PhaseDefinition } from '../walkthrough/phases'
import type { MobileTab } from '../walkthrough/reducer'
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
  sceneModelData: SceneModelData
  source: string
  tokenLabel: (tokenId: number) => string
  trace: TokenStepTrace
  viewModel: WalkthroughLayoutViewModel
}

export function WalkthroughLayout({
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
  sceneModelData,
  source,
  tokenLabel,
  trace,
  viewModel,
}: WalkthroughLayoutProps) {
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
        <div className="story-scene__toolbar-panel" data-lab-tour="controls">
          {controlsPanelContent}
        </div>

        {renderHiddenPanelsDock()}
      </div>
    </div>
  )

  const desktopTopPanel = !isCompact ? (
    <section className="panel-shell desktop-top-panel">
      <div className="desktop-top-panel__body">
        <div
          className={`desktop-top-panel__main${
            viewModel.showDesktopStoryPanel ? '' : ' is-single'
          }`}
        >
          <div
            className={`desktop-top-panel__controls${
              viewModel.showDesktopStoryPanel ? '' : ' is-full'
            }`}
            data-lab-tour="controls"
          >
            {controlsPanelContent}
          </div>

          {viewModel.showDesktopStoryPanel ? (
            <div className="desktop-top-panel__story" data-lab-tour="story">
              <div className="desktop-top-panel__story-header">
                <span className="panel-shell__title">Explanation</span>
                <button
                  type="button"
                  className="panel-shell__toggle"
                  onClick={() => onTogglePanel('story')}
                  aria-expanded="true"
                  aria-controls="story-panel-body"
                >
                  Collapse
                </button>
              </div>
              <div id="story-panel-body" className="desktop-top-panel__story-body">
                <Controls
                  key={`desktop-${mobileTab}-${phase.stepId}-${trace.positionId}-${trace.tokenId}-${trace.sampledTokenId}`}
                  beats={phase.copy.beats}
                />
              </div>
            </div>
          ) : null}
        </div>

        {renderHiddenPanelsDock('panel-dock-shell--inline')}
      </div>
    </section>
  ) : null

  const storyPanel = (
    <div
      className={`story-scene__story ${mobileTab === 'story' ? 'is-active' : ''}`}
      data-lab-tour="story"
    >
      <div className="panel-shell panel-shell--story">
        <div className="panel-shell__header">
          <span className="panel-shell__title">Explanation</span>
          <button
            type="button"
            className="panel-shell__toggle"
            onClick={() => onTogglePanel('story')}
            aria-expanded="true"
            aria-controls="story-panel-body"
          >
            Collapse
          </button>
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

  return (
    <main
      className="walkthrough-layout"
      style={layoutStyle}
    >
      {desktopTopPanel}

      {compactCodeDock}

      {viewModel.showCodeColumn ? (
        <div className={isCompact ? '' : 'left-column'}>
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
                  <CodeViewer source={source} activeRanges={activeRanges} />
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
