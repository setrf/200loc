import type { MatrixData } from './types'

export function matrixRow(matrix: MatrixData, row: number): number[] {
  const start = row * matrix.cols
  const end = start + matrix.cols
  return Array.from(matrix.data.slice(start, end))
}

export function linear(input: readonly number[], matrix: MatrixData): number[] {
  const output = new Array<number>(matrix.rows).fill(0)
  for (let row = 0; row < matrix.rows; row += 1) {
    const base = row * matrix.cols
    let total = 0
    for (let col = 0; col < matrix.cols; col += 1) {
      total += matrix.data[base + col] * input[col]
    }
    output[row] = total
  }
  return output
}

export function rmsnorm(input: readonly number[]): number[] {
  let meanSquare = 0
  for (const value of input) {
    meanSquare += value * value
  }
  meanSquare /= input.length
  const scale = 1 / Math.sqrt(meanSquare + 1e-5)
  return input.map((value) => value * scale)
}

export function softmax(values: readonly number[]): number[] {
  const maxValue = Math.max(...values)
  const exps = values.map((value) => Math.exp(value - maxValue))
  const total = exps.reduce((sum, value) => sum + value, 0)
  return exps.map((value) => value / total)
}

export function addVectors(left: readonly number[], right: readonly number[]): number[] {
  return left.map((value, index) => value + right[index])
}

export function relu(input: readonly number[]): number[] {
  return input.map((value) => Math.max(0, value))
}

export function topCandidates(
  probs: readonly number[],
  vocab: readonly string[],
  limit = 5,
) {
  return probs
    .map((probability, tokenId) => ({
      tokenId,
      token: vocab[tokenId] ?? '<BOS>',
      probability,
    }))
    .sort((left, right) => right.probability - left.probability)
    .slice(0, limit)
}

export function maxAbsDiff(left: readonly number[], right: readonly number[]): number {
  let max = 0
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    max = Math.max(max, Math.abs(left[index] - right[index]))
  }
  return max
}
