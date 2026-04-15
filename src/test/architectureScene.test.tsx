import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React, { forwardRef, useEffect, useImperativeHandle } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ArchitectureScene } from '../components/ArchitectureScene'
import { inferencePhases, vizFocusRanges } from '../walkthrough/phases'
import type { SceneModelData, VizFrame } from '../viz/llmViz/types'
import { loadBundle, makeTrace } from './helpers/fixtures'

const resetToCameraPose = vi.fn()

vi.mock('../viz/microViz/LayerView', () => {
  const MockLayerView = forwardRef<
    { resetToCameraPose: (cameraPoseId: string) => void },
    {
      onHoverFocusChange: (focusId: string | null) => void
      onRenderModeChange: (mode: 'loading' | 'webgl' | 'fallback') => void
      vizFrame: VizFrame
      sceneModelData: SceneModelData
    }
  >(function MockLayerView({ onHoverFocusChange, onRenderModeChange }, ref) {
    useImperativeHandle(ref, () => ({
      resetToCameraPose: (cameraPoseId: string) => resetToCameraPose(cameraPoseId),
    }))

    useEffect(() => {
      onRenderModeChange('webgl')
      onHoverFocusChange('context')
      return () => {
        onHoverFocusChange(null)
      }
    }, [onHoverFocusChange, onRenderModeChange])

    return <div data-testid="mock-layer-view">mock layer</div>
  })

  return { MicroLayerView: MockLayerView }
})

const bundle = loadBundle()

describe('ArchitectureScene webgl path', () => {
  beforeEach(() => {
    resetToCameraPose.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the webgl scene host and forwards hover and reset actions', async () => {
    const onFocusRanges = vi.fn()

    render(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[0]!}
        contextTokens={['BOS']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={onFocusRanges}
      />,
    )

    expect(await screen.findByTestId('mock-layer-view')).toBeInTheDocument()
    expect(screen.queryByText('loading scene…')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(onFocusRanges).toHaveBeenCalledWith(vizFocusRanges.context)
    })

    const viewport = screen.getByTestId('scene-viewport')
    fireEvent.doubleClick(viewport)
    expect(resetToCameraPose).toHaveBeenCalledWith(inferencePhases[0]!.viz.cameraPoseId)

    fireEvent.mouseMove(viewport, { clientX: 25, clientY: 35 })
    fireEvent.mouseLeave(viewport)
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)
  })
})
