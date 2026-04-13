import { maxAbsDiff } from './math'
import { SeededRandom } from './seededRandom'
import type {
  InferenceEngine,
  ModelBundle,
  SessionState,
  TokenStepTrace,
} from './types'

const WORKGROUP_SIZE = 64

interface GpuBufferSet {
  tokenIndex: GPUBuffer
  positionIndex: GPUBuffer
  sequenceLength: GPUBuffer
  temperature: GPUBuffer
  tokenEmbedding: GPUBuffer
  positionEmbedding: GPUBuffer
  xEmbed: GPUBuffer
  xNorm: GPUBuffer
  attnInput: GPUBuffer
  q: GPUBuffer
  k: GPUBuffer
  v: GPUBuffer
  keys: GPUBuffer
  values: GPUBuffer
  scores: GPUBuffer
  weights: GPUBuffer
  headOut: GPUBuffer
  attnProjected: GPUBuffer
  xAfterAttn: GPUBuffer
  mlpHidden: GPUBuffer
  mlpRelu: GPUBuffer
  mlpOutput: GPUBuffer
  xAfterMlp: GPUBuffer
  logits: GPUBuffer
  probs: GPUBuffer
}

export interface GpuStepResult {
  logits: number[]
  probs: number[]
  sampledTokenId: number
}

export class WebGpuEngine implements InferenceEngine {
  private bundle: ModelBundle | null = null
  private device: GPUDevice | null = null
  private buffers: GpuBufferSet | null = null
  private pipelines: Record<string, GPUComputePipeline> = {}
  private bindGroups: Record<string, GPUBindGroup> = {}
  private matrixBuffers = new Map<string, GPUBuffer>()

  get supported() {
    return typeof navigator !== 'undefined' && 'gpu' in navigator
  }

  async init(bundle: ModelBundle) {
    this.bundle = bundle

    if (!this.supported) {
      throw new Error('WebGPU is unavailable')
    }

    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      throw new Error('Failed to acquire a WebGPU adapter')
    }

    this.device = await adapter.requestDevice()
    this.createResources(bundle)
  }

  async runPrefix(prefixTokenIds: number[]): Promise<SessionState> {
    const bundle = this.requireBundle()
    const session: SessionState = {
      contextTokenIds: prefixTokenIds.slice(),
      generatedTokenIds: [],
      visibleTokenIds: prefixTokenIds.slice(),
      keys: Array.from({ length: bundle.config.nLayer }, () => []),
      values: Array.from({ length: bundle.config.nLayer }, () => []),
      position: prefixTokenIds.length,
      done: false,
      backend: 'webgpu',
      currentTokenId:
        prefixTokenIds[prefixTokenIds.length - 1] ?? bundle.config.bosToken,
      sampleState: bundle.sampling.seed >>> 0,
    }

    const consumed =
      prefixTokenIds.length > 0
        ? [bundle.config.bosToken, ...prefixTokenIds.slice(0, -1)]
        : []

    for (let positionId = 0; positionId < consumed.length; positionId += 1) {
      const tokenId = consumed[positionId]
      const step = await this.forward(tokenId, positionId, positionId + 1)
      session.keys[0].push(step.k)
      session.values[0].push(step.v)
    }

    await this.syncCacheBuffers(session)
    return session
  }

  async step(session: SessionState): Promise<TokenStepTrace> {
    const result = await this.forward(
      session.currentTokenId,
      session.position,
      session.position + 1,
    )

    session.keys[0].push(result.k)
    session.values[0].push(result.v)

    const rng = new SeededRandom(session.sampleState)
    const sampledTokenId = rng.nextWeightedIndex(result.probs)
    session.sampleState = rng.snapshot()

    if (
      sampledTokenId === this.requireBundle().config.bosToken ||
      session.position + 1 >= this.requireBundle().config.blockSize
    ) {
      session.done = true
      session.doneReason =
        sampledTokenId === this.requireBundle().config.bosToken ? 'bos' : 'context'
    } else {
      session.generatedTokenIds.push(sampledTokenId)
      session.visibleTokenIds.push(sampledTokenId)
      session.contextTokenIds.push(sampledTokenId)
      session.currentTokenId = sampledTokenId
      session.position += 1
    }

    return {
      tokenId: session.currentTokenId,
      positionId: session.position,
      tokenEmbedding: [],
      positionEmbedding: [],
      xAfterEmbed: [],
      xAfterNorm: [],
      heads: [],
      attnOutput: [],
      xAfterAttnResidual: [],
      mlpHidden: [],
      mlpOutput: [],
      xAfterMlpResidual: [],
      logits: result.logits,
      probs: result.probs,
      sampledTokenId,
      topCandidates: [],
    }
  }

  dispose() {
    this.matrixBuffers.forEach((buffer) => buffer.destroy())
    this.matrixBuffers.clear()
    if (this.buffers) {
      Object.values(this.buffers).forEach((buffer) => buffer.destroy())
    }
    this.buffers = null
    this.bindGroups = {}
    this.pipelines = {}
    this.device = null
  }

  async parityCheck(
    cpuTrace: Pick<TokenStepTrace, 'logits' | 'probs'>,
    session: SessionState,
  ) {
    const snapshot = structuredClone(session)
    const result = await this.forward(
      snapshot.currentTokenId,
      snapshot.position,
      snapshot.position + 1,
    )
    return {
      logitsDiff: maxAbsDiff(cpuTrace.logits, result.logits),
      probsDiff: maxAbsDiff(cpuTrace.probs, result.probs),
    }
  }

  private async forward(tokenId: number, positionId: number, sequenceLength: number) {
    const device = this.requireDevice()
    const buffers = this.requireBuffers()
    const bundle = this.requireBundle()
    const encoder = device.createCommandEncoder()

    device.queue.writeBuffer(buffers.tokenIndex, 0, Uint32Array.of(tokenId))
    device.queue.writeBuffer(buffers.positionIndex, 0, Uint32Array.of(positionId))
    device.queue.writeBuffer(buffers.sequenceLength, 0, Uint32Array.of(sequenceLength))
    device.queue.writeBuffer(
      buffers.temperature,
      0,
      Float32Array.of(bundle.sampling.temperature),
    )

    this.dispatch(encoder, 'lookupToken', bundle.config.nEmbd)
    this.dispatch(encoder, 'lookupPosition', bundle.config.nEmbd)
    this.dispatch(encoder, 'addEmbed', bundle.config.nEmbd)
    this.dispatch(encoder, 'rmsnormEmbed', bundle.config.nEmbd)
    this.dispatch(encoder, 'rmsnormAttnInput', bundle.config.nEmbd)
    this.dispatch(encoder, 'linearQ', bundle.config.nEmbd)
    this.dispatch(encoder, 'linearK', bundle.config.nEmbd)
    this.dispatch(encoder, 'linearV', bundle.config.nEmbd)

    encoder.copyBufferToBuffer(
      buffers.k,
      0,
      buffers.keys,
      positionId * bundle.config.nEmbd * 4,
      bundle.config.nEmbd * 4,
    )
    encoder.copyBufferToBuffer(
      buffers.v,
      0,
      buffers.values,
      positionId * bundle.config.nEmbd * 4,
      bundle.config.nEmbd * 4,
    )

    this.dispatch(encoder, 'attentionScores', bundle.config.nHead * bundle.config.blockSize)
    this.dispatch(encoder, 'attentionSoftmax', bundle.config.nHead)
    this.dispatch(encoder, 'weightedValues', bundle.config.nEmbd)
    this.dispatch(encoder, 'linearAttnOut', bundle.config.nEmbd)
    this.dispatch(encoder, 'addAttnResidual', bundle.config.nEmbd)
    this.dispatch(encoder, 'rmsnormMlpInput', bundle.config.nEmbd)
    this.dispatch(encoder, 'linearMlpHidden', bundle.config.nEmbd * 4)
    this.dispatch(encoder, 'reluMlpHidden', bundle.config.nEmbd * 4)
    this.dispatch(encoder, 'linearMlpOutput', bundle.config.nEmbd)
    this.dispatch(encoder, 'addMlpResidual', bundle.config.nEmbd)
    this.dispatch(encoder, 'linearLogits', bundle.config.vocabSize)
    this.dispatch(encoder, 'softmaxLogits', 1)

    device.queue.submit([encoder.finish()])

    const [k, v, logits, probs] = await Promise.all([
      this.readBuffer(buffers.k, bundle.config.nEmbd),
      this.readBuffer(buffers.v, bundle.config.nEmbd),
      this.readBuffer(buffers.logits, bundle.config.vocabSize),
      this.readBuffer(buffers.probs, bundle.config.vocabSize),
    ])

    const rng = new SeededRandom(bundle.sampling.seed)
    const sampledTokenId = rng.nextWeightedIndex(probs)

    return { k, v, logits, probs, sampledTokenId }
  }

  private dispatch(encoder: GPUCommandEncoder, name: string, totalInvocations: number) {
    const pass = encoder.beginComputePass()
    pass.setPipeline(this.pipelines[name])
    pass.setBindGroup(0, this.bindGroups[name])
    pass.dispatchWorkgroups(Math.ceil(totalInvocations / WORKGROUP_SIZE))
    pass.end()
  }

  private async syncCacheBuffers(session: SessionState) {
    const device = this.requireDevice()
    const buffers = this.requireBuffers()
    const bundle = this.requireBundle()
    const keys = new Float32Array(bundle.config.blockSize * bundle.config.nEmbd)
    const values = new Float32Array(bundle.config.blockSize * bundle.config.nEmbd)

    session.keys[0].forEach((row, index) => {
      keys.set(row, index * bundle.config.nEmbd)
    })
    session.values[0].forEach((row, index) => {
      values.set(row, index * bundle.config.nEmbd)
    })

    device.queue.writeBuffer(buffers.keys, 0, keys)
    device.queue.writeBuffer(buffers.values, 0, values)
  }

  private async readBuffer(buffer: GPUBuffer, size: number) {
    const device = this.requireDevice()
    const byteLength = size * 4
    const staging = device.createBuffer({
      size: byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })
    const encoder = device.createCommandEncoder()
    encoder.copyBufferToBuffer(buffer, 0, staging, 0, byteLength)
    device.queue.submit([encoder.finish()])
    await staging.mapAsync(GPUMapMode.READ)
    const copy = Array.from(new Float32Array(staging.getMappedRange().slice(0)))
    staging.unmap()
    staging.destroy()
    return copy
  }

  private createResources(bundle: ModelBundle) {
    const device = this.requireDevice()
    const createStorage = (size: number) =>
      device.createBuffer({
        size,
        usage:
          GPUBufferUsage.STORAGE |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      })

    const vecBytes = bundle.config.nEmbd * 4
    this.buffers = {
      tokenIndex: createStorage(4),
      positionIndex: createStorage(4),
      sequenceLength: createStorage(4),
      temperature: createStorage(4),
      tokenEmbedding: createStorage(vecBytes),
      positionEmbedding: createStorage(vecBytes),
      xEmbed: createStorage(vecBytes),
      xNorm: createStorage(vecBytes),
      attnInput: createStorage(vecBytes),
      q: createStorage(vecBytes),
      k: createStorage(vecBytes),
      v: createStorage(vecBytes),
      keys: createStorage(bundle.config.blockSize * vecBytes),
      values: createStorage(bundle.config.blockSize * vecBytes),
      scores: createStorage(bundle.config.nHead * bundle.config.blockSize * 4),
      weights: createStorage(bundle.config.nHead * bundle.config.blockSize * 4),
      headOut: createStorage(vecBytes),
      attnProjected: createStorage(vecBytes),
      xAfterAttn: createStorage(vecBytes),
      mlpHidden: createStorage(bundle.config.nEmbd * 4 * 4),
      mlpRelu: createStorage(bundle.config.nEmbd * 4 * 4),
      mlpOutput: createStorage(vecBytes),
      xAfterMlp: createStorage(vecBytes),
      logits: createStorage(bundle.config.vocabSize * 4),
      probs: createStorage(bundle.config.vocabSize * 4),
    }

    Object.entries(bundle.weights).forEach(([name, matrix]) => {
      const buffer = device.createBuffer({
        size: matrix.data.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      })
      new Float32Array(buffer.getMappedRange()).set(matrix.data)
      buffer.unmap()
      this.matrixBuffers.set(name, buffer)
    })

    const configDecl = `
const N_EMBD: u32 = ${bundle.config.nEmbd}u;
const HEAD_DIM: u32 = ${bundle.config.headDim}u;
const N_HEAD: u32 = ${bundle.config.nHead}u;
const BLOCK_SIZE: u32 = ${bundle.config.blockSize}u;
const VOCAB_SIZE: u32 = ${bundle.config.vocabSize}u;
`

    const common = `${configDecl}
@group(0) @binding(0) var<storage, read> inA: array<f32>;
@group(0) @binding(1) var<storage, read> inB: array<f32>;
@group(0) @binding(2) var<storage, read_write> outData: array<f32>;
`

    this.createLookupPipeline(
      'lookupToken',
      `${configDecl}
@group(0) @binding(0) var<storage, read> indexBuf: array<u32>;
@group(0) @binding(1) var<storage, read> matrixBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> outData: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= N_EMBD) { return; }
  let row = indexBuf[0];
  outData[i] = matrixBuf[row * N_EMBD + i];
}
`,
      [this.buffers.tokenIndex, this.requireMatrix('wte'), this.buffers.tokenEmbedding],
    )

    this.createLookupPipeline(
      'lookupPosition',
      `${configDecl}
@group(0) @binding(0) var<storage, read> indexBuf: array<u32>;
@group(0) @binding(1) var<storage, read> matrixBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> outData: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= N_EMBD) { return; }
  let row = indexBuf[0];
  outData[i] = matrixBuf[row * N_EMBD + i];
}
`,
      [this.buffers.positionIndex, this.requireMatrix('wpe'), this.buffers.positionEmbedding],
    )

    this.createPipeline(
      'addEmbed',
      `${common}
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= N_EMBD) { return; }
  outData[i] = inA[i] + inB[i];
}
`,
      [this.buffers.tokenEmbedding, this.buffers.positionEmbedding, this.buffers.xEmbed],
    )

    this.createPipeline(
      'rmsnormEmbed',
      this.rmsnormShader('inA', 'outData', 'x', 'N_EMBD'),
      [this.buffers.xEmbed, this.buffers.positionEmbedding, this.buffers.xNorm],
    )

    this.createPipeline(
      'rmsnormAttnInput',
      this.rmsnormShader('inA', 'outData', 'x', 'N_EMBD'),
      [this.buffers.xNorm, this.buffers.positionEmbedding, this.buffers.attnInput],
    )

    this.createLinearPipeline('linearQ', this.requireMatrix('layer0.attn_wq'), this.buffers.attnInput, this.buffers.q, bundle.config.nEmbd)
    this.createLinearPipeline('linearK', this.requireMatrix('layer0.attn_wk'), this.buffers.attnInput, this.buffers.k, bundle.config.nEmbd)
    this.createLinearPipeline('linearV', this.requireMatrix('layer0.attn_wv'), this.buffers.attnInput, this.buffers.v, bundle.config.nEmbd)
    this.createLinearPipeline('linearAttnOut', this.requireMatrix('layer0.attn_wo'), this.buffers.headOut, this.buffers.attnProjected, bundle.config.nEmbd)
    this.createLinearPipeline('linearMlpHidden', this.requireMatrix('layer0.mlp_fc1'), this.buffers.attnInput, this.buffers.mlpHidden, bundle.config.nEmbd * 4)
    this.createLinearPipeline('linearMlpOutput', this.requireMatrix('layer0.mlp_fc2'), this.buffers.mlpRelu, this.buffers.mlpOutput, bundle.config.nEmbd)
    this.createLinearPipeline('linearLogits', this.requireMatrix('lm_head'), this.buffers.xAfterMlp, this.buffers.logits, bundle.config.vocabSize)

    this.createPipeline(
      'attentionScores',
      `${configDecl}
@group(0) @binding(0) var<storage, read> qBuf: array<f32>;
@group(0) @binding(1) var<storage, read> keyBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> scoreBuf: array<f32>;
@group(0) @binding(3) var<storage, read> seqLenBuf: array<u32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let linearIndex = id.x;
  if (linearIndex >= N_HEAD * BLOCK_SIZE) { return; }
  let head = linearIndex / BLOCK_SIZE;
  let t = linearIndex % BLOCK_SIZE;
  if (t >= seqLenBuf[0]) {
    scoreBuf[linearIndex] = -1e9;
    return;
  }
  let offset = head * HEAD_DIM;
  var total = 0.0;
  for (var dim: u32 = 0u; dim < HEAD_DIM; dim = dim + 1u) {
    total += qBuf[offset + dim] * keyBuf[t * N_EMBD + offset + dim];
  }
  scoreBuf[linearIndex] = total / sqrt(f32(HEAD_DIM));
}
`,
      [this.buffers.q, this.buffers.keys, this.buffers.scores, this.buffers.sequenceLength],
    )

    this.createPipeline(
      'attentionSoftmax',
      `${configDecl}
@group(0) @binding(0) var<storage, read> scoreBuf: array<f32>;
@group(0) @binding(1) var<storage, read> seqLenBuf: array<u32>;
@group(0) @binding(2) var<storage, read_write> weightBuf: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let head = id.x;
  if (head >= N_HEAD) { return; }
  var maxValue = scoreBuf[head * BLOCK_SIZE];
  for (var t: u32 = 1u; t < seqLenBuf[0]; t = t + 1u) {
    let value = scoreBuf[head * BLOCK_SIZE + t];
    if (value > maxValue) {
      maxValue = value;
    }
  }
  var total = 0.0;
  for (var t: u32 = 0u; t < seqLenBuf[0]; t = t + 1u) {
    let value = exp(scoreBuf[head * BLOCK_SIZE + t] - maxValue);
    weightBuf[head * BLOCK_SIZE + t] = value;
    total += value;
  }
  for (var t: u32 = 0u; t < seqLenBuf[0]; t = t + 1u) {
    weightBuf[head * BLOCK_SIZE + t] = weightBuf[head * BLOCK_SIZE + t] / total;
  }
}
`,
      [this.buffers.scores, this.buffers.sequenceLength, this.buffers.weights],
    )

    this.createPipeline(
      'weightedValues',
      `${configDecl}
@group(0) @binding(0) var<storage, read> weightBuf: array<f32>;
@group(0) @binding(1) var<storage, read> valueBuf: array<f32>;
@group(0) @binding(2) var<storage, read> seqLenBuf: array<u32>;
@group(0) @binding(3) var<storage, read_write> outBuf: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let linearIndex = id.x;
  if (linearIndex >= N_EMBD) { return; }
  let head = linearIndex / HEAD_DIM;
  let dim = linearIndex % HEAD_DIM;
  var total = 0.0;
  for (var t: u32 = 0u; t < seqLenBuf[0]; t = t + 1u) {
    total += weightBuf[head * BLOCK_SIZE + t] * valueBuf[t * N_EMBD + head * HEAD_DIM + dim];
  }
  outBuf[linearIndex] = total;
}
`,
      [this.buffers.weights, this.buffers.values, this.buffers.sequenceLength, this.buffers.headOut],
    )

    this.createPipeline(
      'addAttnResidual',
      `${common}
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= N_EMBD) { return; }
  outData[i] = inA[i] + inB[i];
}
`,
      [this.buffers.attnProjected, this.buffers.xNorm, this.buffers.xAfterAttn],
    )

    this.createPipeline(
      'rmsnormMlpInput',
      this.rmsnormShader('inA', 'outData', 'x', 'N_EMBD'),
      [this.buffers.xAfterAttn, this.buffers.positionEmbedding, this.buffers.attnInput],
    )

    this.createPipeline(
      'reluMlpHidden',
      `${configDecl}
@group(0) @binding(0) var<storage, read> inA: array<f32>;
@group(0) @binding(1) var<storage, read> inB: array<f32>;
@group(0) @binding(2) var<storage, read_write> outData: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= N_EMBD * 4u) { return; }
  outData[i] = max(inA[i], 0.0);
}
`,
      [this.buffers.mlpHidden, this.buffers.positionEmbedding, this.buffers.mlpRelu],
    )

    this.createPipeline(
      'addMlpResidual',
      `${common}
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= N_EMBD) { return; }
  outData[i] = inA[i] + inB[i];
}
`,
      [this.buffers.mlpOutput, this.buffers.xAfterAttn, this.buffers.xAfterMlp],
    )

    this.createPipeline(
      'softmaxLogits',
      `${configDecl}
@group(0) @binding(0) var<storage, read> logitsBuf: array<f32>;
@group(0) @binding(1) var<storage, read> temperatureBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> probsBuf: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x > 0u) { return; }
  var maxValue = logitsBuf[0] / temperatureBuf[0];
  for (var i: u32 = 1u; i < VOCAB_SIZE; i = i + 1u) {
    let value = logitsBuf[i] / temperatureBuf[0];
    if (value > maxValue) {
      maxValue = value;
    }
  }
  var total = 0.0;
  for (var i: u32 = 0u; i < VOCAB_SIZE; i = i + 1u) {
    let value = exp(logitsBuf[i] / temperatureBuf[0] - maxValue);
    probsBuf[i] = value;
    total += value;
  }
  for (var i: u32 = 0u; i < VOCAB_SIZE; i = i + 1u) {
    probsBuf[i] = probsBuf[i] / total;
  }
}
`,
      [this.buffers.logits, this.buffers.temperature, this.buffers.probs],
    )
  }

  private createPipeline(name: string, code: string, entries: GPUBuffer[]) {
    const device = this.requireDevice()
    const module = device.createShaderModule({ code })
    const pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module,
        entryPoint: 'main',
      },
    })
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: entries.map((buffer, binding) => ({
        binding,
        resource: {
          buffer,
        },
      })),
    })
    this.pipelines[name] = pipeline
    this.bindGroups[name] = bindGroup
  }

  private createLookupPipeline(name: string, code: string, entries: GPUBuffer[]) {
    this.createPipeline(name, code, entries)
  }

  private createLinearPipeline(
    name: string,
    matrix: GPUBuffer,
    input: GPUBuffer,
    output: GPUBuffer,
    rows: number,
  ) {
    this.createPipeline(
      name,
      `${`
const N_EMBD: u32 = ${this.requireBundle().config.nEmbd}u;
const ROWS: u32 = ${rows}u;
const COLS: u32 = ${this.requireBundle().config.nEmbd}u;
@group(0) @binding(0) var<storage, read> matrixBuf: array<f32>;
@group(0) @binding(1) var<storage, read> inputBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> outputBuf: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let row = id.x;
  if (row >= ROWS) { return; }
  var total = 0.0;
  for (var col: u32 = 0u; col < COLS; col = col + 1u) {
    total += matrixBuf[row * COLS + col] * inputBuf[col];
  }
  outputBuf[row] = total;
}
`}`,
      [matrix, input, output],
    )
  }

  private rmsnormShader(_inputName: string, _outputName: string, _vectorName: string, lengthExpr: string) {
    return `${`
const N_EMBD: u32 = ${this.requireBundle().config.nEmbd}u;
@group(0) @binding(0) var<storage, read> inA: array<f32>;
@group(0) @binding(1) var<storage, read> inB: array<f32>;
@group(0) @binding(2) var<storage, read_write> outData: array<f32>;
@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= ${lengthExpr}) { return; }
  var meanSquare = 0.0;
  for (var idx: u32 = 0u; idx < ${lengthExpr}; idx = idx + 1u) {
    meanSquare += inA[idx] * inA[idx];
  }
  meanSquare = meanSquare / f32(${lengthExpr});
  let scale = inverseSqrt(meanSquare + 1e-5);
  outData[i] = inA[i] * scale;
}
`}`
  }

  private requireBundle() {
    if (!this.bundle) {
      throw new Error('WebGPU engine not initialized')
    }
    return this.bundle
  }

  private requireDevice() {
    if (!this.device) {
      throw new Error('WebGPU device not initialized')
    }
    return this.device
  }

  private requireBuffers() {
    if (!this.buffers) {
      throw new Error('WebGPU buffers not initialized')
    }
    return this.buffers
  }

  private requireMatrix(name: string) {
    const buffer = this.matrixBuffers.get(name)
    if (!buffer) {
      throw new Error(`Missing matrix buffer for ${name}`)
    }
    return buffer
  }
}
