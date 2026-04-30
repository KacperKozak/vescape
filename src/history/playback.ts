export interface TimeStamped {
  capturedAtMs: number
}

export function findNearestSampleIndexByTime<T extends TimeStamped>(
  samples: T[],
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

export function clampHeadTime(
  headTimeMs: number,
  sessionStartMs: number,
  sessionEndMs: number,
): number {
  return Math.max(sessionStartMs, Math.min(sessionEndMs, headTimeMs))
}

export function stepHeadTime(
  headTimeMs: number,
  direction: -1 | 1,
  stepMs: number,
  sessionStartMs: number,
  sessionEndMs: number,
): number {
  return clampHeadTime(headTimeMs + direction * stepMs, sessionStartMs, sessionEndMs)
}
