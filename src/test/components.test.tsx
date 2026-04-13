import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArchitectureScene } from '../components/ArchitectureScene'
import { CodeViewer } from '../components/CodeViewer'
import { Controls } from '../components/Controls'
import { SegmentTabs } from '../components/SegmentTabs'
import { VizRenderer } from '../viz/llmViz/renderer'
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

function makeWebGlContext() {
  return {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    STREAM_DRAW: 0x88e0,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLES: 0x0004,
    LINES: 0x0001,
    FLOAT: 0x1406,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ''),
    getAttribLocation: vi.fn(() => 0),
    getUniformLocation: vi.fn(() => ({})),
    useProgram: vi.fn(),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    uniform2f: vi.fn(),
    drawArrays: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    viewport: vi.fn(),
    deleteBuffer: vi.fn(),
    deleteProgram: vi.fn(),
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

  it('renders the projected fallback scene and exposes code-focus affordances', () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    )
    const onFocusRanges = vi.fn()
    vi.spyOn(VizRenderer.prototype, 'pick').mockReturnValueOnce({
      kind: 'node',
      id: 'context',
    })
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

    expect(screen.getByText('Projected 2D fallback')).toBeInTheDocument()
    expect(screen.getByText('weights came from offline training')).toBeInTheDocument()

    const viewport = screen.getByTestId('scene-viewport')
    fireEvent.pointerMove(viewport, {
      clientX: 120,
      clientY: 120,
    })
    expect(onFocusRanges).toHaveBeenCalledWith([
      { start: 23, end: 27 },
      { start: 191, end: 196 },
    ])

    fireEvent.mouseEnter(screen.getByText('weights came from offline training'))
    expect(onFocusRanges).toHaveBeenCalledWith(trainingAppendix[0].codeRanges)
    fireEvent.mouseLeave(screen.getByText('weights came from offline training'))
    fireEvent.pointerLeave(viewport)
    expect(onFocusRanges).toHaveBeenLastCalledWith(null)
  })

  it('renders tensor windows in the scene layer', () => {
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

    expect(screen.getByTestId('scene-focus-window')).toBeInTheDocument()
    expect(screen.getByText('attention scores')).toBeInTheDocument()
    expect(screen.getByTestId('tensor-surface-scores-h1')).toBeInTheDocument()

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

    expect(screen.getByText('picked 7')).toBeInTheDocument()
  })

  it(
    'renders residual, mlp, and logits overlay states',
    () => {
    const { rerender } = render(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[8]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('tensor-surface-attn_wo')).toBeInTheDocument()

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

    expect(screen.getByTestId('tensor-surface-mlp_fc1')).toBeInTheDocument()
    expect(screen.getByTestId('tensor-surface-mlp_fc2')).toBeInTheDocument()

    rerender(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[10]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByTestId('tensor-surface-lm_head')).toBeInTheDocument()
    expect(screen.getByTestId('tensor-vector-logits')).toBeInTheDocument()
    },
    15000,
  )

  it('uses the webgl2 renderer path when a context is available', () => {
    const gl = makeWebGlContext()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      kind: string,
    ) {
      if (kind === 'webgl2') {
        return gl as never
      }
      return {
        setTransform() {},
        clearRect() {},
        fillRect() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fill() {},
        closePath() {},
      } as never
    })

    render(
      <ArchitectureScene
        trace={makeTrace()}
        phase={inferencePhases[10]}
        contextTokens={['BOS', 'e', 'm']}
        tokenLabel={(tokenId) => (tokenId === 26 ? 'BOS' : String(tokenId))}
        sceneModelData={bundle}
        onFocusRanges={() => {}}
      />,
    )

    expect(screen.getByText('WebGL2 scene')).toBeInTheDocument()
  })
})
