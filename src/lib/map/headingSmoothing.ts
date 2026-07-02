const HEADING_SMOOTHING_TAU_MS = 180
const HEADING_SNAP_DEG = 0.08

export function normalizeHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

function headingDeltaDeg(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

export function smoothHeadingStep(current: number, target: number, elapsedMs: number): number {
  const delta = headingDeltaDeg(current, target)
  if (Math.abs(delta) <= HEADING_SNAP_DEG) return normalizeHeading(target)
  const alpha = 1 - Math.exp(-Math.max(0, elapsedMs) / HEADING_SMOOTHING_TAU_MS)
  return normalizeHeading(current + delta * alpha)
}
