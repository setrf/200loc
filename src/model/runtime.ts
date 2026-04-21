import { createTokenizer } from './tokenizer'
import { ReferenceCpuEngine } from './cpuEngine'
import { WebGpuEngine, WebGpuInitError } from './webgpuEngine'
import { maxAbsDiff } from './math'
import type {
  BackendName,
  EngineDiagnostics,
  ModelBundle,
  SessionState,
} from './types'

const PARITY_EPSILON = 5e-4

export class MicrogptRuntime {
  private cpu = new ReferenceCpuEngine()
  private gpu = new WebGpuEngine()
  private cpuSession: SessionState | null = null
  private gpuSession: SessionState | null = null
  private backend: BackendName = 'cpu'
  private fallbackReason: string | undefined
  private tokenizer
  private bundle: ModelBundle

  constructor(bundle: ModelBundle) {
    this.bundle = bundle
    this.tokenizer = createTokenizer(bundle)
  }

  async init() {
    await this.cpu.init(this.bundle)

    if (!this.gpu.supported) {
      this.backend = 'cpu'
      this.fallbackReason = 'WebGPU is unavailable in this browser.'
      return this.diagnostics
    }

    try {
      await this.gpu.init(this.bundle)
      const parity = await this.runSmokeParityCheck()
      if (parity.logitsDiff > PARITY_EPSILON || parity.probsDiff > PARITY_EPSILON) {
        this.fallbackToCpu('WebGPU parity check drifted on startup.')
      } else {
        this.backend = 'webgpu'
        this.fallbackReason = undefined
      }
    } catch (error) {
      this.fallbackToCpu(this.describeInitFallback(error))

      if (!this.isExpectedInitFallback(error)) {
        console.warn('WebGPU init failed, falling back to CPU.', error)
      }
    }

    return this.diagnostics
  }

  async reset(prefix: string, shouldCommit: () => boolean = () => true) {
    const prefixTokenIds = this.tokenizer.encode(prefix)
    const cpuSession = await this.cpu.runPrefix(prefixTokenIds)
    let gpuSession: SessionState | null = null

    if (this.backend === 'webgpu') {
      try {
        gpuSession = await this.gpu.runPrefix(prefixTokenIds)
      } catch (error) {
        console.warn('WebGPU reset failed, falling back to CPU.', error)
        this.fallbackToCpu('WebGPU failed while resetting inference.')
      }
    }

    const result = await this.stepSessions(cpuSession, gpuSession)
    if (shouldCommit()) {
      this.cpuSession = cpuSession
      this.gpuSession = result.gpuSession
    }
    return {
      trace: result.trace,
      diagnostics: result.diagnostics,
      session: result.session,
    }
  }

  async advance() {
    if (!this.cpuSession) {
      throw new Error('Runtime is not reset')
    }

    const result = await this.stepSessions(this.cpuSession, this.gpuSession)
    this.gpuSession = result.gpuSession

    return result
  }

  get diagnostics(): EngineDiagnostics {
    return {
      activeBackend: this.backend,
      fallbackReason: this.fallbackReason,
    }
  }

  dispose() {
    this.cpu.dispose()
    this.gpu.dispose()
  }

  private async runSmokeParityCheck() {
    const smokePrefix = this.tokenizer.encode('em')
    const cpuSession = await this.cpu.runPrefix(smokePrefix)
    const gpuSession = await this.gpu.runPrefix(smokePrefix)
    const cpuTrace = await this.cpu.step(cpuSession)
    const gpuTrace = await this.gpu.step(gpuSession)
    return {
      logitsDiff: maxAbsDiff(cpuTrace.logits, gpuTrace.logits),
      probsDiff: maxAbsDiff(cpuTrace.probs, gpuTrace.probs),
    }
  }

  private async stepSessions(
    cpuSession: SessionState,
    gpuSession: SessionState | null,
  ) {
    if (cpuSession.done) {
      throw new Error('Runtime is terminal')
    }

    const cpuTrace = await this.cpu.step(cpuSession)
    let nextGpuSession = gpuSession

    if (this.backend === 'webgpu' && nextGpuSession) {
      try {
        const gpuTrace = await this.gpu.step(nextGpuSession)
        if (import.meta.env.DEV) {
          const logitsDiff = maxAbsDiff(cpuTrace.logits, gpuTrace.logits)
          const probsDiff = maxAbsDiff(cpuTrace.probs, gpuTrace.probs)
          if (logitsDiff > PARITY_EPSILON || probsDiff > PARITY_EPSILON) {
            console.warn('WebGPU parity drift detected, falling back to CPU.', {
              logitsDiff,
              probsDiff,
            })
            this.fallbackToCpu('WebGPU parity drifted during inference.')
            nextGpuSession = null
          }
        }
      } catch (error) {
        console.warn('WebGPU step failed, falling back to CPU.', error)
        this.fallbackToCpu('WebGPU failed during inference.')
        nextGpuSession = null
      }
    }

    cpuSession.backend = this.backend

    return {
      trace: cpuTrace,
      diagnostics: this.diagnostics,
      session: cpuSession,
      gpuSession: nextGpuSession,
    }
  }

  private fallbackToCpu(reason: string) {
    this.backend = 'cpu'
    this.fallbackReason = reason
    this.gpuSession = null
    this.gpu.dispose()
  }

  private isExpectedInitFallback(error: unknown) {
    return (
      error instanceof WebGpuInitError &&
      (error.code === 'unavailable' || error.code === 'adapter-unavailable')
    )
  }

  private describeInitFallback(error: unknown) {
    if (!(error instanceof WebGpuInitError)) {
      return 'WebGPU failed to initialize.'
    }

    switch (error.code) {
      case 'unavailable':
        return 'WebGPU is unavailable in this browser.'
      case 'adapter-unavailable':
        return 'WebGPU is supported here, but no GPU adapter is available on this device.'
      case 'device-unavailable':
        return 'WebGPU found an adapter but failed to create a device.'
      default:
        return 'WebGPU failed to initialize.'
    }
  }
}
