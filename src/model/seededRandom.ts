export class SeededRandom {
  private state: number

  constructor(state: number) {
    this.state = state
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    return result
  }

  nextWeightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const target = this.next() * total
    let running = 0
    for (let index = 0; index < weights.length; index += 1) {
      running += weights[index]
      if (target <= running) {
        return index
      }
    }
    return weights.length - 1
  }

  snapshot(): number {
    return this.state >>> 0
  }
}
