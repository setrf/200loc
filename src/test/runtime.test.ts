import { describe, expect, it, vi } from 'vitest'
import { MicrogptRuntime } from '../model'
import { WebGpuInitError } from '../model/webgpuEngine'
import type { SessionState } from '../model'
import { loadBundle, makeTrace } from './helpers/fixtures'

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    contextTokenIds: [],
    generatedTokenIds: [],
    visibleTokenIds: [],
    keys: [[]],
    values: [[]],
    position: 0,
    done: false,
    backend: 'cpu',
    currentTokenId: 26,
    sampleState: 42,
    ...overrides,
  }
}

describe('MicrogptRuntime', () => {
  it('falls back immediately when webgpu is unsupported', async () => {
    const runtime = new MicrogptRuntime(loadBundle()) as any
    const cpu = {
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(makeSession()),
      step: vi.fn().mockResolvedValue(makeTrace()),
      dispose: vi.fn(),
    }
    const gpu = {
      supported: false,
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn(),
      dispose: vi.fn(),
    }
    runtime.cpu = cpu
    runtime.gpu = gpu

    const diagnostics = await runtime.init()
    expect(cpu.init).toHaveBeenCalled()
    expect(diagnostics).toEqual({
      activeBackend: 'cpu',
      fallbackReason: 'WebGPU is unavailable in this browser.',
    })

    const resetResult = await runtime.reset('em')
    expect(gpu.runPrefix).not.toHaveBeenCalled()
    expect(resetResult.diagnostics.activeBackend).toBe('cpu')
  })

  it('prefers webgpu when startup parity succeeds', async () => {
    const trace = makeTrace()
    const runtime = new MicrogptRuntime(loadBundle()) as any
    const cpu = {
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(makeSession()),
      step: vi.fn().mockResolvedValue(trace),
      dispose: vi.fn(),
    }
    const gpu = {
      supported: true,
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(makeSession({ backend: 'webgpu' })),
      step: vi.fn().mockResolvedValue(trace),
      dispose: vi.fn(),
    }
    runtime.cpu = cpu
    runtime.gpu = gpu

    const diagnostics = await runtime.init()
    expect(gpu.init).toHaveBeenCalled()
    expect(diagnostics.activeBackend).toBe('webgpu')
    expect(runtime.diagnostics.activeBackend).toBe('webgpu')
  })

  it('falls back when startup parity drifts or init throws', async () => {
    const trace = makeTrace()
    const drifted = makeTrace({
      logits: trace.logits.map((value, index) => value + (index === 0 ? 1 : 0)),
      probs: trace.probs.map((value, index) => value + (index === 0 ? 0.1 : 0)),
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const parityRuntime = new MicrogptRuntime(loadBundle()) as any
    parityRuntime.cpu = {
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(makeSession()),
      step: vi.fn().mockResolvedValue(trace),
      dispose: vi.fn(),
    }
    parityRuntime.gpu = {
      supported: true,
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(makeSession({ backend: 'webgpu' })),
      step: vi.fn().mockResolvedValue(drifted),
      dispose: vi.fn(),
    }
    const parityDiagnostics = await parityRuntime.init()
    expect(parityDiagnostics).toEqual({
      activeBackend: 'cpu',
      fallbackReason: 'WebGPU parity check drifted on startup.',
    })
    expect(parityRuntime.gpu.dispose).toHaveBeenCalled()

    const failedRuntime = new MicrogptRuntime(loadBundle()) as any
    failedRuntime.cpu = {
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn(),
      dispose: vi.fn(),
    }
    failedRuntime.gpu = {
      supported: true,
      init: vi.fn().mockRejectedValue(new Error('no gpu')),
      runPrefix: vi.fn(),
      step: vi.fn(),
      dispose: vi.fn(),
    }
    const failedDiagnostics = await failedRuntime.init()
    expect(failedDiagnostics).toEqual({
      activeBackend: 'cpu',
      fallbackReason: 'WebGPU failed to initialize.',
    })
    expect(consoleWarn).toHaveBeenCalled()
    expect(failedRuntime.gpu.dispose).toHaveBeenCalled()

    const adapterlessRuntime = new MicrogptRuntime(loadBundle()) as any
    adapterlessRuntime.cpu = {
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn(),
      dispose: vi.fn(),
    }
    adapterlessRuntime.gpu = {
      supported: true,
      init: vi
        .fn()
        .mockRejectedValue(
          new WebGpuInitError(
            'adapter-unavailable',
            'No WebGPU adapter is available on this device',
          ),
        ),
      runPrefix: vi.fn(),
      step: vi.fn(),
      dispose: vi.fn(),
    }
    const adapterlessDiagnostics = await adapterlessRuntime.init()
    expect(adapterlessDiagnostics).toEqual({
      activeBackend: 'cpu',
      fallbackReason:
        'WebGPU is supported here, but no GPU adapter is available on this device.',
    })
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(adapterlessRuntime.gpu.dispose).toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  it('describes device creation and unknown webgpu init failures', () => {
    const runtime = new MicrogptRuntime(loadBundle()) as unknown as {
      describeInitFallback: (error: unknown) => string
    }

    expect(
      runtime.describeInitFallback(
        new WebGpuInitError('unavailable', 'WebGPU unavailable'),
      ),
    ).toBe('WebGPU is unavailable in this browser.')
    expect(
      runtime.describeInitFallback(
        new WebGpuInitError('device-unavailable', 'device creation failed'),
      ),
    ).toBe('WebGPU found an adapter but failed to create a device.')
    expect(
      runtime.describeInitFallback(
        new WebGpuInitError('mystery' as never, 'unknown'),
      ),
    ).toBe('WebGPU failed to initialize.')
    expect(runtime.describeInitFallback(new Error('boom'))).toBe(
      'WebGPU failed to initialize.',
    )
  })

  it('resets, advances, and disposes through the active backend', async () => {
    const trace = makeTrace()
    const nextTrace = makeTrace({ positionId: 3, sampledTokenId: 11 })
    const cpuSession = makeSession()
    const gpuSession = makeSession({ backend: 'webgpu' })
    const runtime = new MicrogptRuntime(loadBundle()) as any
    const cpu = {
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(cpuSession),
      step: vi.fn().mockResolvedValueOnce(trace).mockResolvedValueOnce(nextTrace),
      dispose: vi.fn(),
    }
    const gpu = {
      supported: true,
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(gpuSession),
      step: vi.fn().mockResolvedValue(trace),
      dispose: vi.fn(),
    }
    runtime.cpu = cpu
    runtime.gpu = gpu
    runtime.backend = 'webgpu'

    const resetResult = await runtime.reset('em')
    expect(cpu.runPrefix).toHaveBeenCalled()
    expect(gpu.runPrefix).toHaveBeenCalled()
    expect(resetResult.trace).toEqual(trace)
    expect(resetResult.session.backend).toBe('webgpu')

    const advanced = await runtime.advance()
    expect(advanced.trace).toEqual(nextTrace)
    runtime.dispose()
    expect(cpu.dispose).toHaveBeenCalled()
    expect(gpu.dispose).toHaveBeenCalled()
  })

  it('keeps existing runtime state if the gpu prefix path fails during reset', async () => {
    const runtime = new MicrogptRuntime(loadBundle()) as any
    const previousCpuSession = makeSession({ currentTokenId: 4 })
    const previousGpuSession = makeSession({ backend: 'webgpu', currentTokenId: 4 })
    runtime.cpuSession = previousCpuSession
    runtime.gpuSession = previousGpuSession
    runtime.backend = 'webgpu'
    runtime.cpu = {
      init: vi.fn(),
      runPrefix: vi.fn().mockResolvedValue(makeSession({ currentTokenId: 12 })),
      step: vi.fn(),
      dispose: vi.fn(),
    }
    runtime.gpu = {
      supported: true,
      init: vi.fn(),
      runPrefix: vi.fn().mockRejectedValue(new Error('gpu prefix failed')),
      step: vi.fn(),
      dispose: vi.fn(),
    }

    await expect(runtime.reset('em')).rejects.toThrow('gpu prefix failed')
    expect(runtime.cpuSession).toBe(previousCpuSession)
    expect(runtime.gpuSession).toBe(previousGpuSession)
  })

  it('throws before reset and falls back when gpu drift or step errors occur', async () => {
    const trace = makeTrace()
    const drifted = makeTrace({
      logits: trace.logits.map((value, index) => value + (index === 0 ? 2 : 0)),
      probs: trace.probs.map((value, index) => value + (index === 0 ? 0.2 : 0)),
    })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const runtime = new MicrogptRuntime(loadBundle()) as any
    runtime.cpu = {
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn().mockResolvedValue(trace),
      dispose: vi.fn(),
    }
    runtime.gpu = {
      supported: true,
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn().mockResolvedValueOnce(drifted).mockRejectedValueOnce(new Error('boom')),
      dispose: vi.fn(),
    }

    await expect(runtime.advance()).rejects.toThrow('Runtime is not reset')

    runtime.backend = 'webgpu'
    runtime.cpuSession = makeSession()
    runtime.gpuSession = makeSession({ backend: 'webgpu' })

    const driftResult = await runtime.advance()
    expect(driftResult.diagnostics).toEqual({
      activeBackend: 'cpu',
      fallbackReason: 'WebGPU parity drifted during inference.',
    })
    expect(runtime.gpu.dispose).toHaveBeenCalledTimes(1)

    runtime.backend = 'webgpu'
    runtime.cpuSession = makeSession()
    runtime.gpuSession = makeSession({ backend: 'webgpu' })
    const errorResult = await runtime.advance()
    expect(errorResult.diagnostics).toEqual({
      activeBackend: 'cpu',
      fallbackReason: 'WebGPU failed during inference.',
    })
    expect(runtime.gpu.dispose).toHaveBeenCalledTimes(2)
    expect(consoleWarn).toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  it('rejects attempts to advance a terminal runtime session', async () => {
    const runtime = new MicrogptRuntime(loadBundle()) as any
    runtime.cpuSession = makeSession({ done: true })

    await expect(runtime.advance()).rejects.toThrow('Runtime is terminal')
  })

  it('skips dev parity checks when DEV is false', async () => {
    const originalDev = import.meta.env.DEV
    ;(import.meta.env as { DEV: boolean }).DEV = false

    const trace = makeTrace()
    const runtime = new MicrogptRuntime(loadBundle()) as any
    runtime.cpu = {
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn().mockResolvedValue(trace),
      dispose: vi.fn(),
    }
    runtime.gpu = {
      supported: true,
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn().mockResolvedValue(
        makeTrace({
          logits: trace.logits.map((value) => value + 5),
          probs: trace.probs.map((value) => value + 1),
        }),
      ),
      dispose: vi.fn(),
    }
    runtime.backend = 'webgpu'
    runtime.cpuSession = makeSession()
    runtime.gpuSession = makeSession({ backend: 'webgpu' })

    const result = await runtime.advance()
    expect(result.diagnostics.activeBackend).toBe('webgpu')

    ;(import.meta.env as { DEV: boolean }).DEV = originalDev
  })

  it('advances on cpu without touching the gpu branch', async () => {
    const trace = makeTrace()
    const runtime = new MicrogptRuntime(loadBundle()) as any
    runtime.cpu = {
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn().mockResolvedValue(trace),
      dispose: vi.fn(),
    }
    runtime.gpu = {
      supported: true,
      init: vi.fn(),
      runPrefix: vi.fn(),
      step: vi.fn(),
      dispose: vi.fn(),
    }
    runtime.backend = 'cpu'
    runtime.cpuSession = makeSession()
    runtime.gpuSession = null

    const result = await runtime.advance()
    expect(runtime.gpu.step).not.toHaveBeenCalled()
    expect(result.session.backend).toBe('cpu')
  })
})
