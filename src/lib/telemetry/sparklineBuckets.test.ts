import { describe, expect, it } from 'bun:test'

import { createBuckets, pushBucketSample } from './sparklineBuckets'

const WINDOW = 60_000

describe('sparklineBuckets', () => {
  it('places a sample in the newest bucket at creation time', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    pushBucketSample(b, 1_000_000, 42)
    expect(b.last[b.count - 1]).toBe(42)
    expect(b.last[0]).toBeNaN()
  })

  it('aggregates min/max/last within one bucket', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    const t = 1_000_000
    pushBucketSample(b, t, 10)
    pushBucketSample(b, t + 1, 30)
    pushBucketSample(b, t + 2, 20)
    const i = b.count - 1
    expect(b.min[i]).toBe(10)
    expect(b.max[i]).toBe(30)
    expect(b.last[i]).toBe(20) // last write wins for the line value
  })

  it('slides the window forward as time advances, dropping oldest', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    const bucketMs = b.bucketMs
    pushBucketSample(b, 1_000_000, 1) // lands in last bucket
    // Advance two buckets into the future.
    pushBucketSample(b, 1_000_000 + bucketMs * 2, 2)
    expect(b.last[b.count - 1]).toBe(2)
    // The original sample shifted left by two slots.
    expect(b.last[b.count - 3]).toBe(1)
  })

  it('resets when a sample jumps past the whole window', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    pushBucketSample(b, 1_000_000, 1)
    pushBucketSample(b, 1_000_000 + WINDOW * 5, 9)
    expect(b.last[b.count - 1]).toBe(9)
    expect(b.last.filter((v) => !Number.isNaN(v))).toEqual([9])
  })

  it('ignores samples older than the window and non-finite values', () => {
    const b = createBuckets(6, WINDOW, 1_000_000)
    pushBucketSample(b, 1_000_000, 5)
    pushBucketSample(b, 1_000_000 - WINDOW * 2, 99) // too old
    pushBucketSample(b, 1_000_000, Number.NaN) // non-finite
    expect(b.last.filter((v) => !Number.isNaN(v))).toEqual([5])
  })

  it('keeps a stable bucket count', () => {
    const b = createBuckets(32, WINDOW, 0)
    expect(b.last).toHaveLength(32)
    expect(b.min).toHaveLength(32)
    expect(b.max).toHaveLength(32)
  })
})
