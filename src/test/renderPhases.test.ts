import { describe, expect, it, vi } from 'vitest'
import {
  createBufferTex,
  writeToBufferTex,
} from '../vendor/llmVizOriginal/utils/renderPhases'

function makeGlStub() {
  return {
    TEXTURE_2D: 0x0de1,
    FLOAT: 0x1406,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    RED: 0x1903,
    R32F: 0x822e,
    RG: 0x8227,
    RG32F: 0x8230,
    RGB: 0x1907,
    RGB32F: 0x8815,
    RGBA: 0x1908,
    RGBA32F: 0x8814,
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texImage2D: vi.fn(),
    texParameteri: vi.fn(),
    texSubImage2D: vi.fn(),
  } as unknown as WebGL2RenderingContext
}

describe('renderPhases buffer textures', () => {
  it('creates CPU-mirrored buffers and keeps them in sync on upload', () => {
    const gl = makeGlStub()
    const texture = createBufferTex(gl, 3, 2, 1)

    expect(texture.localBuffer).toBeInstanceOf(Float32Array)
    expect(texture.localBuffer).toHaveLength(6)
    expect(Array.from(texture.localBuffer ?? [])).toEqual([0, 0, 0, 0, 0, 0])

    const firstData = Float32Array.from([1, 2, 3, 4, 5, 6])
    writeToBufferTex(gl, texture, firstData)
    expect(Array.from(texture.localBuffer ?? [])).toEqual(Array.from(firstData))

    const secondData = Float32Array.from([6, 5, 4, 3, 2, 1])
    writeToBufferTex(gl, texture, secondData)
    expect(Array.from(texture.localBuffer ?? [])).toEqual(Array.from(secondData))
    expect(gl.texSubImage2D).toHaveBeenCalledTimes(2)
  })
})
