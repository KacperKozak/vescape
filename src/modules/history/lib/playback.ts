export interface TimeStamped {
  capturedAtMs: number
}

export function findNearestSampleIndexByTime<T extends TimeStamped>(
  samples: readonly T[],
  targetMs: number,
): number {
  if (!samples.length) return -1
  let lo = 0
  let hi = samples.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const at = samples[mid].capturedAtMs
    if (at === targetMs) return mid
    if (at < targetMs) lo = mid + 1
    else hi = mid - 1
  }

  if (hi < 0) return 0
  if (lo >= samples.length) return samples.length - 1

  const before = samples[hi]
  const after = samples[lo]
  return targetMs - before.capturedAtMs <= after.capturedAtMs - targetMs ? hi : lo
}

export function downsampleTimeSeries<T>(
  samples: T[],
  maxPoints: number,
  getTimeMs: (sample: T) => number,
): T[] {
  if (samples.length <= maxPoints) return samples
  if (maxPoints <= 1) return [samples[0]]

  const first = samples[0]
  const last = samples[samples.length - 1]
  const result: T[] = [first]
  const remaining = maxPoints - 2
  const interiorCount = samples.length - 2

  if (remaining <= 0 || interiorCount <= 0) return [first, last]

  for (let i = 0; i < remaining; i += 1) {
    const from = 1 + Math.floor((i * interiorCount) / remaining)
    const to = 1 + Math.floor(((i + 1) * interiorCount) / remaining)
    const start = Math.min(from, samples.length - 2)
    const end = Math.max(start + 1, Math.min(to, samples.length - 1))
    const centerTime = (getTimeMs(samples[start]) + getTimeMs(samples[end - 1])) / 2

    let best = start
    let bestDistance = Number.POSITIVE_INFINITY
    for (let j = start; j < end; j += 1) {
      const d = Math.abs(getTimeMs(samples[j]) - centerTime)
      if (d < bestDistance) {
        bestDistance = d
        best = j
      }
    }
    result.push(samples[best])
  }

  result.push(last)
  return result
}
