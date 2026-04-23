import { fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ArchitectureScene } from '../components/ArchitectureScene'
import { projectScene } from '../viz/llmViz/layout'
import { inferencePhases } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

vi.mock('../viz/microViz/LayerView', () => ({
  MicroLayerView: function MockLayerView({
    onRenderModeChange,
  }: {
    onRenderModeChange: (mode: 'loading' | 'webgl' | 'fallback') => void
  }) {
    useEffect(() => {
      onRenderModeChange('fallback')
    }, [onRenderModeChange])
    return null
  },
}))

vi.mock('../viz/llmViz/layout', async () => {
  const actual = await vi.importActual<typeof import('../viz/llmViz/layout')>(
    '../viz/llmViz/layout',
  )

  return {
    ...actual,
    projectScene: vi.fn(() => ({
      nodes: [
        {
          id: 'context',
          label: 'Context Strip',
          subtitle: 'visible slots',
          front: [[0, 0]],
          top: [[0, 0]],
          side: [[0, 0]],
          center: { x: 30, y: 30 },
          anchors: {
            top: { x: 0, y: 0 },
            right: { x: 0, y: 0 },
            bottom: { x: 0, y: 0 },
            left: { x: 0, y: 0 },
          },
          bounds: { minX: 10, minY: 10, maxX: 60, maxY: 60 },
        },
      ],
      edges: [
        {
          id: 'zero-length-edge',
          from: 'context',
          to: 'context',
          start: { x: 200, y: 200 },
          end: { x: 200, y: 200 },
        },
        {
          id: 'context-to-token-embedding',
          from: 'context',
          to: 'token-embedding',
          start: { x: 90, y: 20 },
          end: { x: 150, y: 20 },
        },
      ],
      nodeMap: {},
      edgeMap: {},
    })),
  }
})

const bundle = loadBundle()

describe('ArchitectureScene fallback hover path', () => {
  it('maps node hits, edge hits, and misses to focus ranges', () => {
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

    expect(screen.getByText('Static model map')).toBeInTheDocument()
    expect(screen.getByText('Readable history for this moment')).toBeInTheDocument()

    const viewport = screen.getByTestId('scene-viewport')
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 400,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.mouseMove(viewport, { clientX: 20, clientY: 20 })
    expect(onFocusRanges).toHaveBeenLastCalledWith([
      { start: 23, end: 27 },
      { start: 191, end: 196 },
    ])

    fireEvent.mouseMove(viewport, { clientX: 120, clientY: 20 })
    expect(onFocusRanges).toHaveBeenLastCalledWith([{ start: 109, end: 109 }])

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    })
    viewport.dispatchEvent(contextMenuEvent)
    expect(contextMenuEvent.defaultPrevented).toBe(true)
    fireEvent.mouseMove(viewport, { clientX: 320, clientY: 260 })
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)
  })

  it('ignores projected focus ids that do not map to code ranges', () => {
    vi.mocked(projectScene).mockReturnValue({
      nodes: [
        {
          id: 'unknown-node' as never,
          label: 'Unknown',
          subtitle: '',
          front: [[0, 0]],
          top: [[0, 0]],
          side: [[0, 0]],
          center: { x: 30, y: 30 },
          anchors: {
            top: { x: 0, y: 0 },
            right: { x: 0, y: 0 },
            bottom: { x: 0, y: 0 },
            left: { x: 0, y: 0 },
          },
          bounds: { minX: 10, minY: 10, maxX: 60, maxY: 60 },
        },
      ],
      edges: [],
      nodeMap: {} as never,
      edgeMap: {} as never,
    } as never)

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

    const viewport = screen.getByTestId('scene-viewport')
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      top: 0,
      left: 0,
      bottom: 400,
      right: 400,
      toJSON: () => ({}),
    } as DOMRect)

    fireEvent.mouseMove(viewport, { clientX: 20, clientY: 20 })
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)
  })
})
