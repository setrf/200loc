import '@testing-library/jest-dom/vitest'
import React from 'react'
import { vi } from 'vitest'

vi.mock('@llmviz/llm/LayerView', () => ({
  LayerView: ({
    className,
    externalPhase,
    showSidebar,
    showToolbar,
  }: {
    className?: string
    externalPhase?: number
    showSidebar?: boolean
    showToolbar?: boolean
  }) =>
    React.createElement(
      'div',
      {
        className,
        'data-phase': externalPhase,
        'data-sidebar': String(showSidebar),
        'data-testid': 'vendored-layer-view',
        'data-toolbar': String(showToolbar),
      },
      `Original LayerView ${externalPhase ?? 'none'}`,
    ),
}))

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value(kind: string) {
    if (kind === '2d') {
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
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
      }
    }

    return null
  },
})
