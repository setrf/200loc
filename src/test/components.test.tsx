import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArchitectureScene } from '../components/ArchitectureScene'
import { CodeViewer } from '../components/CodeViewer'
import { Controls } from '../components/Controls'
import { SegmentTabs } from '../components/SegmentTabs'
import { inferencePhases, trainingAppendix } from '../walkthrough/phases'
import { loadBundle, makeTrace } from './helpers/fixtures'

const bundle = loadBundle()

function makeControlsProps() {
  return {
    prefix: '',
    normalization: {
      normalized: '',
      removedUnsupported: false,
      truncated: false,
    },
    backend: 'cpu' as 'cpu' | 'webgpu',
    fallbackReason: 'WebGPU is unavailable in this browser.',
    phaseTitle: 'Tokenize Prefix',
    phaseStep: 1,
    phaseCount: 14,
    transitionLabel: 'p0:BOS -> p1:stop',
    explanationTitle: 'Stand on p0:BOS',
    explanationBody:
      'The model starts from the current slot and every visible slot already cached to its left.',
    explanationWhy:
      'Autoregressive decoding always predicts one token ahead from the current slot and the context behind it.',
    codeRanges: inferencePhases[0].codeRanges,
    appendixOpen: false,
    appendixSections: trainingAppendix,
    playing: false,
    canPrev: false,
    canNext: true,
    onPrefixChange: vi.fn(),
    onReset: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onTogglePlay: vi.fn(),
    onToggleAppendix: vi.fn(),
    onFocusRanges: vi.fn(),
  }
}

describe('ui components', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('highlights active code lines', () => {
    render(
      <CodeViewer
        source={'first\nsecond\nthird'}
        activeRanges={[{ start: 2, end: 2 }]}
      />,
    )
    expect(screen.getByText('second').closest('li')).toHaveClass('is-active')
    expect(screen.getByText('first').closest('li')).not.toHaveClass('is-active')
  })

  it('renders blank code lines safely', () => {
    render(<CodeViewer source={'first\n\nthird'} activeRanges={[]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('renders the story controls, appendix toggle, and hover mapping', () => {
    const props = makeControlsProps()
    render(<Controls {...props} />)

    expect(screen.getByText('CPU fallback')).toBeInTheDocument()
    expect(screen.getByText('Stand on p0:BOS')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Prefix'), {
      target: { value: 'em' },
    })
    expect(props.onPrefixChange).toHaveBeenCalledWith('em')

    fireEvent.mouseEnter(screen.getByText('CPU fallback'))
    fireEvent.mouseLeave(screen.getByText('CPU fallback'))
    fireEvent.mouseEnter(screen.getByText('step 1 / 14'))
    expect(props.onFocusRanges).toHaveBeenCalledWith(inferencePhases[0].codeRanges)
    fireEvent.mouseEnter(screen.getByText('Current phase').parentElement!)
    fireEvent.mouseLeave(screen.getByText('Current phase').parentElement!)
    fireEvent.mouseEnter(screen.getByText('p0:BOS -> p1:stop'))
    fireEvent.mouseLeave(screen.getByText('p0:BOS -> p1:stop'))

    fireEvent.click(screen.getByRole('button', { name: 'Show training note' }))
    expect(props.onToggleAppendix).toHaveBeenCalled()
  })

  it('renders appendix content and webgpu play state', () => {
    const props = makeControlsProps()
    props.backend = 'webgpu'
    props.playing = true
    props.canPrev = true
    props.appendixOpen = true
    props.normalization = {
      normalized: 'abcdefghijklmno',
      removedUnsupported: false,
      truncated: true,
    }

    render(<Controls {...props} />)

    expect(screen.getByText('WebGPU')).toBeInTheDocument()
    expect(screen.getByText('Prefix was capped at 15 characters.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(props.onTogglePlay).toHaveBeenCalled()
    fireEvent.mouseEnter(screen.getByText('Dataset + Shuffle'))
    expect(props.onFocusRanges).toHaveBeenCalledWith(trainingAppendix[0].codeRanges)
  })

  it('switches mobile tabs through the callback', () => {
    const onChange = vi.fn()
    render(<SegmentTabs activeTab="story" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Scene' }))
    expect(onChange).toHaveBeenCalledWith('scene')
  })

  it('renders the microgpt scene fallback and exposes code-focus affordances', async () => {
    const onFocusRanges = vi.fn()
    render(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[1]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={onFocusRanges}
      />,
    )

    expect(await screen.findByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.getByText('drag to pan · wheel to zoom · double click to reset')).toBeInTheDocument()
    expect(screen.queryByText('Original llm-viz')).not.toBeInTheDocument()
    expect(screen.queryByTestId('vendored-layer-view')).not.toBeInTheDocument()
    expect(screen.queryByText('visible cache')).not.toBeInTheDocument()

    const scene = screen.getByLabelText('Architecture scene')
    fireEvent.mouseEnter(scene)
    expect(onFocusRanges).toHaveBeenCalledWith(inferencePhases[1].codeRanges)
    fireEvent.mouseLeave(scene)
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)
  })

  it('keeps the scene shell stable as phases change', async () => {
    const { rerender } = render(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[5]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(await screen.findByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.queryByText('attention scores')).not.toBeInTheDocument()

    rerender(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[6]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.queryByText('attention weights')).not.toBeInTheDocument()

    rerender(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[9]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('fallback-scene')).toBeInTheDocument()

    rerender(
      <ArchitectureScene
        trace={makeTrace({ sampledTokenId: 7 })}
        phase={inferencePhases[13]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('fallback-scene')).toBeInTheDocument()
    expect(screen.queryByText('append or stop')).not.toBeInTheDocument()
  })
})
