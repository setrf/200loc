import { beforeEach, describe, expect, it, vi } from 'vitest'

const renderMock = vi.fn()
const createRootMock = vi.fn(() => ({
  render: renderMock,
}))

vi.mock('react-dom/client', () => ({
  createRoot: createRootMock,
}))

vi.mock('../App.tsx', () => ({
  default: () => null,
}))

describe('main bootstrap', () => {
  beforeEach(() => {
    vi.resetModules()
    renderMock.mockClear()
    createRootMock.mockClear()
    document.body.innerHTML = '<div id="root"></div>'
  })

  it('mounts the app into the root element', async () => {
    await import('../main.tsx')

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById('root'))
    expect(renderMock).toHaveBeenCalledTimes(1)
  })
})
