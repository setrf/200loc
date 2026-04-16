import '@testing-library/jest-dom/vitest'
import { beforeEach, vi } from 'vitest'

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

class LocalStorageMock implements Storage {
  private store = new Map<string, string>()

  get length() {
    return this.store.size
  }

  clear() {
    this.store.clear()
  }

  getItem(key: string) {
    return this.store.get(key) ?? null
  }

  key(index: number) {
    return [...this.store.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.store.delete(key)
  }

  setItem(key: string, value: string) {
    this.store.set(key, String(value))
  }
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

vi.stubGlobal('ResizeObserver', ResizeObserverMock)
vi.stubGlobal('matchMedia', matchMediaMock)
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: new LocalStorageMock(),
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
