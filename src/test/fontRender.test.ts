import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFontAtlasData } from '../vendor/llmVizOriginal/llm/render/fontRender'

describe('fetchFontAtlasData', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads the same-origin font definition without no-cors fetch options', async () => {
    const fontDef = { faces: [] }
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => fontDef,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const originalCreateElement = document.createElement.bind(document)
    const image = {
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
      set src(_: string) {
        queueMicrotask(() => {
          image.onload?.()
        })
      },
    }

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'img') {
        return image as unknown as HTMLImageElement
      }
      return originalCreateElement(tagName)
    })

    const result = await fetchFontAtlasData()

    expect(fetchMock).toHaveBeenCalledWith('fonts/font-def.json')
    expect(result.fontDef).toEqual(fontDef)
    expect(result.fontAtlasImage).toBe(image)
  })
})
