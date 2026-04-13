import '@testing-library/jest-dom/vitest'

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
