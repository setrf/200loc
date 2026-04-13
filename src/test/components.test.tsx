import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Appendix } from '../components/Appendix'
import { AttentionCard } from '../components/AttentionCard'
import { CodeViewer } from '../components/CodeViewer'
import { Controls } from '../components/Controls'
import { SequenceStrip } from '../components/SequenceStrip'
import { SegmentTabs } from '../components/SegmentTabs'
import { VectorBars } from '../components/VectorBars'
import { trainingAppendix } from '../walkthrough/phases'
import { makeTrace } from './helpers/fixtures'

describe('ui components', () => {
  it('highlights active code lines', () => {
    render(<CodeViewer source={'first\nsecond\nthird'} activeRanges={[{ start: 2, end: 2 }]} />)
    expect(screen.getByText('second').closest('li')).toHaveClass('is-active')
    expect(screen.getByText('first').closest('li')).not.toHaveClass('is-active')
  })

  it('renders blank code lines safely', () => {
    render(<CodeViewer source={'first\n\nthird'} activeRanges={[]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })

  it('renders the fallback backend badge', () => {
    render(
      <Controls
        prefix=""
        normalization={{
          normalized: '',
          removedUnsupported: false,
          truncated: false,
        }}
        backend="cpu"
        fallbackReason="WebGPU unavailable"
        phaseTitle="Sample"
        tokenPosition={0}
        playing={false}
        canPrev={false}
        canNext={true}
        onPrefixChange={() => {}}
        onReset={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        onTogglePlay={() => {}}
      />,
    )

    expect(screen.getByText('CPU fallback')).toBeInTheDocument()
    expect(screen.getByText('WebGPU unavailable')).toBeInTheDocument()
  })

  it('handles the truncated helper, webgpu badge, and input changes', () => {
    const onPrefixChange = vi.fn()
    render(
      <Controls
        prefix="abcdefghijklmnop"
        normalization={{
          normalized: 'abcdefghijklmno',
          removedUnsupported: false,
          truncated: true,
        }}
        backend="webgpu"
        phaseTitle="Sample"
        tokenPosition={3}
        playing={true}
        canPrev={true}
        canNext={true}
        onPrefixChange={onPrefixChange}
        onReset={() => {}}
        onPrev={() => {}}
        onNext={() => {}}
        onTogglePlay={() => {}}
      />,
    )

    expect(screen.getByText('WebGPU')).toBeInTheDocument()
    expect(screen.getByText('Prefix was capped at 15 characters.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Prefix'), { target: { value: 'em' } })
    expect(onPrefixChange).toHaveBeenCalledWith('em')
  })

  it('switches mobile tabs through the callback', () => {
    const onChange = vi.fn()
    render(<SegmentTabs activeTab="story" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'viz' }))
    expect(onChange).toHaveBeenCalledWith('viz')
  })

  it('renders sequence, attention, appendix, and vector cards', () => {
    const trace = makeTrace()
    const onFocusRanges = vi.fn()

    render(
      <>
        <SequenceStrip
          tokens={['e', 'm']}
          currentToken="m"
          sampledToken="BOS"
          terminal
        />
        <AttentionCard heads={trace.heads} />
        <VectorBars values={trace.tokenEmbedding} label="token row" compact />
        <Appendix
          open={true}
          sections={trainingAppendix}
          onToggle={() => {}}
          onFocusRanges={onFocusRanges}
        />
      </>,
    )

    expect(screen.getByText('Context and next token')).toBeInTheDocument()
    expect(screen.getByText('Head 1')).toBeInTheDocument()
    expect(screen.getByText('token row')).toBeInTheDocument()
    fireEvent.mouseEnter(screen.getByText('Dataset + Shuffle'))
    expect(onFocusRanges).toHaveBeenCalled()
  })

  it('renders vector bars without optional label metadata', () => {
    const { container } = render(<VectorBars values={[1, -0.5]} />)
    expect(container.querySelector('.vector-bars--compact')).toBeNull()
    expect(container.querySelector('.vector-bars__label')).toBeNull()
    expect(container.querySelectorAll('.vector-bars__row')).toHaveLength(2)
  })
})
