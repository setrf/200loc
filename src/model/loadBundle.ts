import type { MatrixData, MatrixDataJson, ModelBundle, ModelBundleJson } from './types'

const REQUIRED_WEIGHT_SHAPES = {
  wte: (bundle: ModelBundleJson) => [bundle.config.vocabSize, bundle.config.nEmbd],
  wpe: (bundle: ModelBundleJson) => [bundle.config.blockSize, bundle.config.nEmbd],
  lm_head: (bundle: ModelBundleJson) => [bundle.config.vocabSize, bundle.config.nEmbd],
  'layer0.attn_wq': (bundle: ModelBundleJson) => [bundle.config.nEmbd, bundle.config.nEmbd],
  'layer0.attn_wk': (bundle: ModelBundleJson) => [bundle.config.nEmbd, bundle.config.nEmbd],
  'layer0.attn_wv': (bundle: ModelBundleJson) => [bundle.config.nEmbd, bundle.config.nEmbd],
  'layer0.attn_wo': (bundle: ModelBundleJson) => [bundle.config.nEmbd, bundle.config.nEmbd],
  'layer0.mlp_fc1': (bundle: ModelBundleJson) => [bundle.config.nEmbd * 4, bundle.config.nEmbd],
  'layer0.mlp_fc2': (bundle: ModelBundleJson) => [bundle.config.nEmbd, bundle.config.nEmbd * 4],
} satisfies Record<string, (bundle: ModelBundleJson) => [number, number]>

function failValidation(message: string): never {
  throw new Error(`Invalid model bundle: ${message}`)
}

function isPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0
}

function validateMatrixShape(
  bundle: ModelBundleJson,
  name: keyof typeof REQUIRED_WEIGHT_SHAPES,
  matrix: MatrixDataJson | undefined,
) {
  if (!matrix) {
    failValidation(`missing required weight "${name}"`)
  }

  const [expectedRows, expectedCols] = REQUIRED_WEIGHT_SHAPES[name](bundle)
  if (matrix.rows !== expectedRows || matrix.cols !== expectedCols) {
    failValidation(
      `"${name}" must have shape ${expectedRows}x${expectedCols}, received ${matrix.rows}x${matrix.cols}`,
    )
  }

  if (matrix.data.length !== matrix.rows * matrix.cols) {
    failValidation(
      `"${name}" data length must be ${matrix.rows * matrix.cols}, received ${matrix.data.length}`,
    )
  }
}

function validateBundle(bundle: ModelBundleJson) {
  const { config, vocab, sampling, weights } = bundle

  if (!isPositiveInteger(config.vocabSize)) {
    failValidation('config.vocabSize must be a positive integer')
  }
  if (!isPositiveInteger(config.nLayer)) {
    failValidation('config.nLayer must be a positive integer')
  }
  if (!isPositiveInteger(config.nEmbd)) {
    failValidation('config.nEmbd must be a positive integer')
  }
  if (!isPositiveInteger(config.nHead)) {
    failValidation('config.nHead must be a positive integer')
  }
  if (!isPositiveInteger(config.headDim)) {
    failValidation('config.headDim must be a positive integer')
  }
  if (!isPositiveInteger(config.blockSize) || config.blockSize < 2) {
    failValidation('config.blockSize must be an integer greater than 1')
  }
  if (!Number.isInteger(config.bosToken) || config.bosToken < 0) {
    failValidation('config.bosToken must be a non-negative integer')
  }
  if (config.vocabSize !== vocab.length) {
    failValidation(
      `config.vocabSize must match vocab length (${config.vocabSize} !== ${vocab.length})`,
    )
  }
  if (config.bosToken >= config.vocabSize) {
    failValidation('config.bosToken must reference a token inside the vocabulary')
  }
  if (config.headDim * config.nHead !== config.nEmbd) {
    failValidation('config.headDim * config.nHead must equal config.nEmbd')
  }
  if (config.nLayer !== 1) {
    failValidation('200loc only supports bundles with exactly one transformer layer')
  }
  if (config.nHead !== 4) {
    failValidation('200loc only supports bundles with exactly four attention heads')
  }
  if (!Number.isFinite(sampling.temperature) || sampling.temperature <= 0) {
    failValidation('sampling.temperature must be a positive finite number')
  }
  if (!Number.isInteger(sampling.seed)) {
    failValidation('sampling.seed must be an integer')
  }
  if (vocab.some((token) => typeof token !== 'string')) {
    failValidation('vocab entries must all be strings')
  }

  ;(Object.keys(REQUIRED_WEIGHT_SHAPES) as Array<keyof typeof REQUIRED_WEIGHT_SHAPES>).forEach(
    (name) => {
      validateMatrixShape(bundle, name, weights[name])
    },
  )
}

function hydrateMatrix(matrix: MatrixDataJson): MatrixData {
  return {
    rows: matrix.rows,
    cols: matrix.cols,
    data: Float32Array.from(matrix.data),
  }
}

export function resolveAssetPath(path: string) {
  const base = import.meta.env.BASE_URL ?? '/'
  return `${base}${path.replace(/^\/+/, '')}`
}

export async function loadModelBundle(
  path = resolveAssetPath('assets/microgpt-model.json'),
): Promise<ModelBundle> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load model bundle: ${response.status}`)
  }

  const json = (await response.json()) as ModelBundleJson
  validateBundle(json)
  const weights = Object.fromEntries(
    Object.entries(json.weights).map(([name, matrix]) => [name, hydrateMatrix(matrix)]),
  )

  return {
    ...json,
    weights,
  }
}
