import { describe, expect, test } from 'bun:test'

import { emaSeries } from './smoothing'

describe('emaSeries', () => {
  test('returns input unchanged for empty series or non-positive half-life', () => {
    expect(emaSeries([], 1000)).toEqual([])
    const samples = [
      { ts: 0, value: 10 },
      { ts: 100, value: 20 },
    ]
    expect(emaSeries(samples, 0)).toEqual(samples)
    expect(emaSeries(samples, -1)).toEqual(samples)
  })

  test('first sample passes through unchanged', () => {
    const out = emaSeries([{ ts: 0, value: 42 }], 1000)
    expect(out[0]).toEqual({ ts: 0, value: 42 })
  })

  test('after one half-life the value moves halfway toward the input', () => {
    const HALF_LIFE_MS = 1000
    const out = emaSeries(
      [
        { ts: 0, value: 0 },
        { ts: HALF_LIFE_MS, value: 100 },
      ],
      HALF_LIFE_MS,
    )
    expect(out[1].value).toBeCloseTo(50, 1)
  })

  test('long gap produces near-instant catch-up (alpha → 1)', () => {
    const out = emaSeries(
      [
        { ts: 0, value: 0 },
        { ts: 100_000, value: 100 }, // 100s gap with 1s half-life
      ],
      1000,
    )
    expect(out[1].value).toBeCloseTo(100, 5)
  })

  test('preserves extra fields on each sample', () => {
    const out = emaSeries(
      [
        { ts: 0, value: 0, label: 'a' },
        { ts: 100, value: 10, label: 'b' },
      ],
      100,
    )
    expect(out[0].label).toBe('a')
    expect(out[1].label).toBe('b')
  })

  test('settles toward a constant input', () => {
    const samples = Array.from({ length: 50 }, (_, i) => ({ ts: i * 100, value: 42 }))
    samples[0].value = 0
    const out = emaSeries(samples, 200)
    expect(out.at(-1)!.value).toBeCloseTo(42, 2)
  })
})
