import type { MatrixData, MatrixDataJson, ModelBundle, ModelBundleJson } from './types'

function hydrateMatrix(matrix: MatrixDataJson): MatrixData {
  return {
    rows: matrix.rows,
    cols: matrix.cols,
    data: Float32Array.from(matrix.data),
  }
}

export async function loadModelBundle(path = '/assets/microgpt-model.json'): Promise<ModelBundle> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load model bundle: ${response.status}`)
  }

  const json = (await response.json()) as ModelBundleJson
  const weights = Object.fromEntries(
    Object.entries(json.weights).map(([name, matrix]) => [name, hydrateMatrix(matrix)]),
  )

  return {
    ...json,
    weights,
  }
}
