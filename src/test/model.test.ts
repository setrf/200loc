import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTokenizer,
  maxAbsDiff,
  ReferenceCpuEngine,
  rmsnorm,
  SeededRandom,
  softmax,
  topCandidates,
  type ModelBundle,
  type TokenStepTrace,
} from '../model'
import { loadBundle, loadTraceFixture } from './helpers/fixtures'

describe('model utilities', () => {
  it('normalizes, encodes, and decodes prefixes', () => {
    const bundle = loadBundle()
    const tokenizer = createTokenizer(bundle)
    const normalized = tokenizer.normalizePrefix('Em!123MMMMMMMMMMMMMMMM')
    expect(normalized.normalized).toHaveLength(15)
    expect(normalized.normalized.startsWith('em')).toBe(true)
    expect(normalized.removedUnsupported).toBe(true)
    expect(normalized.truncated).toBe(true)
    expect(tokenizer.decode(tokenizer.encode('em'))).toBe('em')
    expect(tokenizer.decode([bundle.config.bosToken, 999])).toBe('')
    expect(tokenizer.tokenLabel(bundle.config.bosToken)).toBe('BOS')
    expect(tokenizer.tokenLabel(999)).toBe('?')
  })

  it('keeps rmsnorm and softmax numerically stable', () => {
    const normalized = rmsnorm([1, 2, 3, 4])
    expect(normalized).toHaveLength(4)
    expect(softmax([1_000, 1_001, 999]).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8)
    expect(topCandidates([0.1, 0.9], ['a'])[0].token).toBe('<BOS>')
  })

  it('handles seeded-random edge cases', () => {
    const rng = new SeededRandom(123)
    expect(rng.nextWeightedIndex([])).toBe(-1)
  })
})

describe('reference cpu engine', () => {
  let bundle: ModelBundle
  let fixture: TokenStepTrace & { prefix: string }

  beforeAll(() => {
    bundle = loadBundle()
    fixture = loadTraceFixture()
  })

  it('matches the exported reference trace for prefix em', async () => {
    const tokenizer = createTokenizer(bundle)
    const engine = new ReferenceCpuEngine()
    await engine.init(bundle)
    const session = await engine.runPrefix(tokenizer.encode(fixture.prefix))
    const trace = await engine.step(session)

    expect(trace.tokenId).toBe(fixture.tokenId)
    expect(trace.positionId).toBe(fixture.positionId)
    expect(trace.sampledTokenId).toBe(fixture.sampledTokenId)
    expect(maxAbsDiff(trace.tokenEmbedding, fixture.tokenEmbedding)).toBeLessThan(1e-6)
    expect(maxAbsDiff(trace.positionEmbedding, fixture.positionEmbedding)).toBeLessThan(1e-6)
    expect(maxAbsDiff(trace.logits, fixture.logits)).toBeLessThan(1e-6)
    expect(maxAbsDiff(trace.probs, fixture.probs)).toBeLessThan(1e-6)
    expect(maxAbsDiff(trace.xAfterMlpResidual, fixture.xAfterMlpResidual)).toBeLessThan(1e-6)
    expect(trace.topCandidates[0].tokenId).toBe(fixture.topCandidates[0].tokenId)
  })

  it('stops when context reaches the 16-token window', async () => {
    const tokenizer = createTokenizer(bundle)
    const engine = new ReferenceCpuEngine()
    await engine.init(bundle)
    const session = await engine.runPrefix(tokenizer.encode('aaaaaaaaaaaaaaa'))
    await engine.step(session)
    expect(session.done).toBe(true)
    expect(['context', 'bos']).toContain(session.doneReason)
  })

  it('marks the terminal reason as context when the block limit is hit before BOS', async () => {
    const tokenizer = createTokenizer(bundle)
    const engine = new ReferenceCpuEngine()
    await engine.init(bundle)
    const session = await engine.runPrefix(tokenizer.encode('em'))
    session.position = bundle.config.blockSize - 1
    await engine.step(session)
    expect(session.doneReason).toBe('context')
  })

  it('handles empty prefixes and initialization guards', async () => {
    const engine = new ReferenceCpuEngine()
    await expect(engine.runPrefix([])).rejects.toThrow('CPU engine not initialized')

    await engine.init(bundle)
    const session = await engine.runPrefix([])
    expect(session.currentTokenId).toBe(bundle.config.bosToken)
    expect(session.keys[0]).toHaveLength(0)
    expect(session.values[0]).toHaveLength(0)
    engine.dispose()
  })

  it('throws if asked to step a terminal session', async () => {
    const engine = new ReferenceCpuEngine()
    await engine.init(bundle)

    await expect(
      engine.step({
        contextTokenIds: [],
        generatedTokenIds: [],
        visibleTokenIds: [],
        keys: [[]],
        values: [[]],
        position: 0,
        done: true,
        backend: 'cpu',
        currentTokenId: bundle.config.bosToken,
        sampleState: bundle.sampling.seed,
      }),
    ).rejects.toThrow('CPU session is terminal')
  })
})
