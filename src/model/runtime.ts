import { createTokenizer } from './tokenizer'
import { ReferenceCpuEngine } from './cpuEngine'
import { WebGpuEngine } from './webgpuEngine'
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
        this.backend = 'cpu'
        this.fallbackReason = 'WebGPU parity check drifted on startup.'
      } else {
        this.backend = 'webgpu'
      }
    } catch (error) {
      console.warn('WebGPU init failed, falling back to CPU.', error)
      this.backend = 'cpu'
      this.fallbackReason = 'WebGPU failed to initialize.'
    }

    return this.diagnostics
  }

  async reset(prefix: string) {
    const prefixTokenIds = this.tokenizer.encode(prefix)
    this.cpuSession = await this.cpu.runPrefix(prefixTokenIds)
    this.gpuSession =
      this.backend === 'webgpu' ? await this.gpu.runPrefix(prefixTokenIds) : null
    return this.advance()
  }

  async advance() {
    if (!this.cpuSession) {
      throw new Error('Runtime is not reset')
    }

    const cpuTrace = await this.cpu.step(this.cpuSession)

    if (this.backend === 'webgpu' && this.gpuSession) {
      try {
        const gpuTrace = await this.gpu.step(this.gpuSession)
        if (import.meta.env.DEV) {
          const logitsDiff = maxAbsDiff(cpuTrace.logits, gpuTrace.logits)
          const probsDiff = maxAbsDiff(cpuTrace.probs, gpuTrace.probs)
          if (logitsDiff > PARITY_EPSILON || probsDiff > PARITY_EPSILON) {
            console.warn('WebGPU parity drift detected, falling back to CPU.', {
              logitsDiff,
              probsDiff,
            })
            this.backend = 'cpu'
            this.fallbackReason = 'WebGPU parity drifted during inference.'
            this.gpuSession = null
          }
        }
      } catch (error) {
        console.warn('WebGPU step failed, falling back to CPU.', error)
        this.backend = 'cpu'
        this.fallbackReason = 'WebGPU failed during inference.'
        this.gpuSession = null
      }
    }

    this.cpuSession.backend = this.backend

    return {
      trace: cpuTrace,
      diagnostics: this.diagnostics,
      session: this.cpuSession!,
    }
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
}
