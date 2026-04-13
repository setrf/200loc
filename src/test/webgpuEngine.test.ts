import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebGpuEngine } from '../model'
import type { SessionState } from '../model'
import { loadBundle } from './helpers/fixtures'

class MockGpuBuffer {
  destroyed = false
  private storage: ArrayBuffer
  public readonly size: number
  readonly mappedAtCreation: boolean

  constructor(size: number, mappedAtCreation = false) {
    this.size = size
    this.mappedAtCreation = mappedAtCreation
    this.storage = new ArrayBuffer(size)
  }

  getMappedRange() {
    return this.storage
  }

  async mapAsync() {}

  unmap() {}

  destroy() {
    this.destroyed = true
  }
}

function copyBytes(
  source: MockGpuBuffer,
  sourceOffset: number,
  target: MockGpuBuffer,
  targetOffset: number,
  size: number,
) {
  const sourceBytes = new Uint8Array(source.getMappedRange(), sourceOffset, size)
  new Uint8Array(target.getMappedRange(), targetOffset, size).set(sourceBytes)
}

function writeFloats(buffer: MockGpuBuffer, values: number[]) {
  new Float32Array(buffer.getMappedRange()).set(values)
}

function createMockDevice() {
  const createdBuffers: MockGpuBuffer[] = []
  const queue = {
    writeBuffer(buffer: MockGpuBuffer, offset: number, data: ArrayBufferView) {
      const bytes = new Uint8Array(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      )
      new Uint8Array(buffer.getMappedRange(), offset, bytes.byteLength).set(bytes)
    },
    submit: vi.fn(),
  }

  const device = {
    queue,
    createBuffer: vi.fn((options: { size: number; mappedAtCreation?: boolean }) => {
      const buffer = new MockGpuBuffer(options.size, options.mappedAtCreation)
      createdBuffers.push(buffer)
      return buffer
    }),
    createShaderModule: vi.fn(({ code }: { code: string }) => ({ code })),
    createComputePipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({})),
    })),
    createBindGroup: vi.fn((options) => options),
    createCommandEncoder: vi.fn(() => ({
      beginComputePass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups: vi.fn(),
        end: vi.fn(),
      })),
      copyBufferToBuffer: vi.fn(copyBytes),
      finish: vi.fn(() => ({})),
    })),
  }

  return { device, createdBuffers }
}

describe('WebGpuEngine', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    ;(globalThis as unknown as { GPUBufferUsage: Record<string, number> }).GPUBufferUsage = {
      STORAGE: 1,
      COPY_DST: 2,
      COPY_SRC: 4,
      MAP_READ: 8,
    }
    ;(globalThis as unknown as { GPUMapMode: Record<string, number> }).GPUMapMode = {
      READ: 1,
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
    })
  })

  it('reports support correctly and throws on missing adapters', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
    })
    const unavailable = new WebGpuEngine()
    expect(unavailable.supported).toBe(false)
    await expect(unavailable.init(loadBundle())).rejects.toThrow('WebGPU is unavailable')

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue(null),
        },
      },
      configurable: true,
    })
    const missingAdapter = new WebGpuEngine()
    expect(missingAdapter.supported).toBe(true)
    await expect(missingAdapter.init(loadBundle())).rejects.toThrow(
      'Failed to acquire a WebGPU adapter',
    )
  })

  it('initializes resources, runs prefixes, steps, parity checks, and disposes', async () => {
    const bundle = loadBundle()
    const { device } = createMockDevice()
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({
            requestDevice: vi.fn().mockResolvedValue(device),
          }),
        },
      },
      configurable: true,
    })

    const engine = new WebGpuEngine() as any
    await engine.init(bundle)

    const buffers = engine.buffers as Record<string, MockGpuBuffer>
    writeFloats(buffers.k, Array.from({ length: bundle.config.nEmbd }, (_, index) => index + 1))
    writeFloats(buffers.v, Array.from({ length: bundle.config.nEmbd }, (_, index) => index + 21))
    writeFloats(
      buffers.logits,
      Array.from({ length: bundle.config.vocabSize }, (_, index) => index),
    )
    writeFloats(
      buffers.probs,
      Array.from({ length: bundle.config.vocabSize }, (_, index) => (index === 5 ? 1 : 0)),
    )

    const emptySession = await engine.runPrefix([])
    expect(emptySession.position).toBe(0)

    const session = await engine.runPrefix([4, 12])
    expect(session.keys[0]).toHaveLength(2)
    expect(session.values[0]).toHaveLength(2)

    const trace = await engine.step(session)
    expect(trace.sampledTokenId).toBe(5)
    expect(trace.logits.at(0)).toBe(0)
    expect(trace.probs[5]).toBe(1)
    expect(session.currentTokenId).toBe(5)

    const parity = await engine.parityCheck(
      { logits: trace.logits, probs: trace.probs },
      session,
    )
    expect(parity).toEqual({ logitsDiff: 0, probsDiff: 0 })

    engine.dispose()
    expect(Object.values(buffers).every((buffer) => buffer.destroyed)).toBe(true)
  })

  it('handles BOS and context termination branches', async () => {
    const bundle = loadBundle()
    const { device } = createMockDevice()
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        gpu: {
          requestAdapter: vi.fn().mockResolvedValue({
            requestDevice: vi.fn().mockResolvedValue(device),
          }),
        },
      },
      configurable: true,
    })

    const engine = new WebGpuEngine() as any
    await engine.init(bundle)
    const buffers = engine.buffers as Record<string, MockGpuBuffer>

    writeFloats(buffers.k, new Array(bundle.config.nEmbd).fill(1))
    writeFloats(buffers.v, new Array(bundle.config.nEmbd).fill(2))
    writeFloats(buffers.logits, new Array(bundle.config.vocabSize).fill(0))
    writeFloats(
      buffers.probs,
      Array.from({ length: bundle.config.vocabSize }, (_, index) =>
        index === bundle.config.bosToken ? 1 : 0,
      ),
    )

    const bosSession: SessionState = {
      contextTokenIds: [],
      generatedTokenIds: [],
      visibleTokenIds: [],
      keys: [[]],
      values: [[]],
      position: 0,
      done: false,
      backend: 'webgpu',
      currentTokenId: bundle.config.bosToken,
      sampleState: bundle.sampling.seed,
    }
    await engine.step(bosSession)
    expect(bosSession.doneReason).toBe('bos')

    writeFloats(
      buffers.probs,
      Array.from({ length: bundle.config.vocabSize }, (_, index) =>
        index === 4 ? 1 : 0,
      ),
    )
    const contextSession: SessionState = {
      ...bosSession,
      done: false,
      position: bundle.config.blockSize - 1,
      doneReason: undefined,
    }
    await engine.step(contextSession)
    expect(contextSession.doneReason).toBe('context')
  })

  it('exposes internal guard errors for missing state', () => {
    const engine = new WebGpuEngine() as any
    expect(() => engine.requireBundle()).toThrow('WebGPU engine not initialized')
    expect(() => engine.requireDevice()).toThrow('WebGPU device not initialized')
    expect(() => engine.requireBuffers()).toThrow('WebGPU buffers not initialized')
    engine.bundle = loadBundle()
    expect(() => engine.requireMatrix('missing')).toThrow(
      'Missing matrix buffer for missing',
    )
    engine.dispose()
  })
})
