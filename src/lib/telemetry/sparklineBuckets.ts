/**
 * Incremental display-bucket aggregation for live sparklines.
 *
 * The live history buffer holds thousands of raw samples. Re-projecting and
 * re-pathing all of them on every publish pegs the JS thread. Instead we keep a
 * small, fixed-count set of evenly-spaced time buckets per metric and update
 * only the current bucket as samples arrive — O(1) per sample instead of O(N)
 * per publish.
 *
 * Buckets are evenly spaced across the window, so a chart's x-position is
 * implicit in the bucket index (no per-point timestamp needed at draw time).
 * `last` carries the line value (calm); `min`/`max` are kept for peak/alert use.
 * Empty buckets hold NaN.
 */
export interface SparklineBuckets {
  count: number
  bucketMs: number
  /** Start time of the oldest bucket (index 0). */
  startMs: number
  /** Line value per bucket (NaN = no sample landed in it). */
  last: number[]
  min: number[]
  max: number[]
}

function filled(count: number): number[] {
  return new Array(count).fill(NaN)
}

export function createBuckets(count: number, windowMs: number, nowMs: number): SparklineBuckets {
  const safeCount = Math.max(2, Math.floor(count))
  const bucketMs = windowMs / safeCount
  return {
    count: safeCount,
    bucketMs,
    // Anchor the newest bucket at `nowMs` so the first sample lands at the edge.
    startMs: nowMs - bucketMs * (safeCount - 1),
    last: filled(safeCount),
    min: filled(safeCount),
    max: filled(safeCount),
  }
}

/** Slide the window forward by `shift` buckets, dropping the oldest. */
function advance(b: SparklineBuckets, shift: number): void {
  if (shift >= b.count) {
    b.last = filled(b.count)
    b.min = filled(b.count)
    b.max = filled(b.count)
  } else {
    b.last.splice(0, shift)
    b.min.splice(0, shift)
    b.max.splice(0, shift)
    for (let i = 0; i < shift; i += 1) {
      b.last.push(NaN)
      b.min.push(NaN)
      b.max.push(NaN)
    }
  }
  b.startMs += b.bucketMs * shift
}

/**
 * Fold one sample into its bucket, sliding the window if the sample is newer
 * than the current head. Samples older than the window are ignored.
 */
export function pushBucketSample(b: SparklineBuckets, t: number, value: number): void {
  if (!Number.isFinite(value)) return
  let idx = Math.floor((t - b.startMs) / b.bucketMs)
  if (idx >= b.count) {
    advance(b, idx - (b.count - 1))
    idx = b.count - 1
  }
  if (idx < 0) return // older than the window — drop

  b.last[idx] = value
  b.min[idx] = Number.isNaN(b.min[idx]) ? value : Math.min(b.min[idx], value)
  b.max[idx] = Number.isNaN(b.max[idx]) ? value : Math.max(b.max[idx], value)
}
