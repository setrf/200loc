import { beforeEach, describe, expect, it, vi } from 'vitest'
import { drawBlockInfo } from '../vendor/llmVizOriginal/llm/components/BlockInfo'

const {
  measureTextWidthMock,
  writeTextToBufferMock,
} = vi.hoisted(() => ({
  measureTextWidthMock: vi.fn(() => 18),
  writeTextToBufferMock: vi.fn(),
}))

vi.mock('../vendor/llmVizOriginal/llm/render/fontRender', () => ({
  measureTextWidth: measureTextWidthMock,
  writeTextToBuffer: writeTextToBufferMock,
}))

function cube(overrides: Record<string, unknown>) {
  return {
    idx: 0,
    name: 'fc1',
    opacity: 1,
    x: 0,
    y: 0,
    z: 0,
    dx: 24,
    dy: 24,
    dz: 6,
    ...overrides,
  }
}

function renderedLabels() {
  return writeTextToBufferMock.mock.calls
    .filter((_, index) => index % 2 === 1)
    .map((call) => call[1])
}

function renderedTextCalls() {
  return writeTextToBufferMock.mock.calls.filter((_, index) => index % 2 === 1)
}

describe('drawBlockInfo', () => {
  beforeEach(() => {
    measureTextWidthMock.mockClear()
    writeTextToBufferMock.mockClear()
  })

  it('renders one representative for repeated low-level labels and chooses the closest block', () => {
    drawBlockInfo({
      layout: {
        cubes: [
          cube({ idx: 0, name: 'attention scores', z: 2 }),
          cube({ idx: 1, name: 'attention scores', z: 8 }),
          cube({ idx: 2, name: 'fc1', z: 4 }),
        ],
      },
      render: {
        modelFontBuf: {},
      },
    } as never)

    expect(renderedLabels()).toEqual(['attention scores', 'fc1'])
    expect(writeTextToBufferMock).toHaveBeenCalledTimes(4)
  })

  it('skips structural, blank, and hidden labels', () => {
    drawBlockInfo({
      layout: {
        cubes: [
          cube({ idx: 0, name: 'attention' }),
          cube({ idx: 1, name: 'projection' }),
          cube({ idx: 2, name: 'Q weights' }),
          cube({ idx: 3, name: '' }),
          cube({ idx: 4, name: 'relu', opacity: 0 }),
          cube({ idx: 5, name: 'logits' }),
        ],
      },
      render: {
        modelFontBuf: {},
      },
    } as never)

    expect(renderedLabels()).toEqual(['logits'])
    expect(writeTextToBufferMock).toHaveBeenCalledTimes(2)
  })

  it('nudges later labels down when their text boxes would overlap', () => {
    drawBlockInfo({
      layout: {
        cubes: [
          cube({ idx: 0, name: 'attention exp', x: 20, y: 40, dx: 8, dy: 12 }),
          cube({ idx: 1, name: 'attention max', x: 21, y: 40, dx: 8, dy: 12 }),
          cube({ idx: 2, name: '', x: 220, y: 0, dx: 8, dy: 8 }),
        ],
      },
      render: {
        modelFontBuf: {},
      },
    } as never)

    const [first, second] = renderedTextCalls()
    expect(first?.[4]).toBe(40)
    expect(second?.[4]).toBeGreaterThan(40)
  })
})
