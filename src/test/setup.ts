import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const matchMediaMock = (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false
  },
})

function createStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return [...store.keys()][index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)
vi.stubGlobal('matchMedia', matchMediaMock)
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: createStorageMock(),
})
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: matchMediaMock,
  })
  window.localStorage.clear()
})

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
