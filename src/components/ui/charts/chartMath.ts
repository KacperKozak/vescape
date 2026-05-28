export interface TelemetryChartPoint {
  date: Date
  value: number
}

export interface TelemetryChartRange {
  y: { min: number; max: number }
}

export interface ExcludedRange {
  startMs: number
  endMs: number
  reason: string
}

const DEFAULT_GAP_MULTIPLIER = 3

interface AutoRangeOptions {
  includeZero?: boolean
  minSpan?: number
  paddingRatio?: number
  fallbackMin?: number
  fallbackMax?: number
  baseline?: { min: number; max: number }
}

interface ResolvedRangeOptions {
  includeZero: boolean
  minSpan: number
  paddingRatio: number
  fallbackMin: number
  fallbackMax: number
  baseline: { min: number; max: number } | undefined
}

function resolveRangeOptions(options?: AutoRangeOptions): ResolvedRangeOptions {
  return {
    includeZero: options?.includeZero ?? false,
    minSpan: options?.minSpan ?? 0,
    paddingRatio: options?.paddingRatio ?? 0,
    fallbackMin: options?.fallbackMin ?? options?.baseline?.min ?? -1,
    fallbackMax: options?.fallbackMax ?? options?.baseline?.max ?? 1,
    baseline: options?.baseline,
  }
}

function getMinMax(points: TelemetryChartPoint[], opts: ResolvedRangeOptions) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const point of points) {
    min = Math.min(min, point.value)
    max = Math.max(max, point.value)
  }

  if (opts.baseline) {
    min = Math.min(min, opts.baseline.min)
    max = Math.max(max, opts.baseline.max)
  }

  if (opts.includeZero) {
    if (min > 0) min = 0
    if (max < 0) max = 0
  }

  const span = Math.max(opts.minSpan, max - min)
  const pad = span * opts.paddingRatio
  return { min: min - pad, max: max + pad }
}

export function computeAutoRange(
  points: TelemetryChartPoint[],
  options?: AutoRangeOptions,
): TelemetryChartRange {
  const opts = resolveRangeOptions(options)
  if (!points.length) return { y: { min: opts.fallbackMin, max: opts.fallbackMax } }
  return { y: getMinMax(points, opts) }
}

export function getChartPosition(
  points: TelemetryChartPoint[],
  point: TelemetryChartPoint,
  range: { y: { min: number; max: number } },
  width: number,
  height: number,
  windowMs?: number,
): { x: number; y: number } | null {
  if (points.length < 2) return null
  const xMax = points[points.length - 1].date.getTime()
  const xMin = windowMs ? xMax - windowMs : points[0].date.getTime()
  const xSpan = xMax - xMin
  const ySpan = range.y.max - range.y.min
  if (xSpan <= 0 || ySpan <= 0) return null

  const inset = 2
  const x = width * ((point.date.getTime() - xMin) / xSpan)
  const t = (point.value - range.y.min) / ySpan
  const y = height - inset - (height - inset * 2) * t
  return {
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y)),
  }
}

export function getXPosition(
  points: TelemetryChartPoint[],
  timeMs: number,
  width: number,
  windowMs?: number,
): number | null {
  if (points.length < 2) return null
  const xMax = points[points.length - 1].date.getTime()
  const xMin = windowMs ? xMax - windowMs : points[0].date.getTime()
  const xSpan = xMax - xMin
  if (xSpan <= 0) return null
  const x = width * ((timeMs - xMin) / xSpan)
  return Math.max(0, Math.min(width, x))
}

export function toExcludedRanges(
  exclusions: Array<{
    startMs: number
    endMs: number
    reason: string
    metrics: Record<string, boolean>
  }>,
  metric: string | string[],
  mergeGapMs = 2000,
): ExcludedRange[] {
  const metrics = Array.isArray(metric) ? metric : [metric]
  const sorted = exclusions
    .filter((e) => metrics.some((m) => e.metrics[m]))
    .sort((a, b) => a.startMs - b.startMs)
  const ranges: ExcludedRange[] = []
  for (const e of sorted) {
    const last = ranges.at(-1)
    if (last && last.reason === e.reason && e.startMs - last.endMs <= mergeGapMs) {
      last.endMs = Math.max(last.endMs, e.endMs)
    } else {
      ranges.push({ startMs: e.startMs, endMs: e.endMs, reason: e.reason })
    }
  }
  return ranges
}

export function findNearestChartPointAtX(
  points: TelemetryChartPoint[],
  x: number,
  width: number,
  windowMs?: number,
): TelemetryChartPoint | null {
  if (points.length === 0 || width <= 0) return null
  const xMax = points[points.length - 1].date.getTime()
  const xMin = windowMs ? xMax - windowMs : points[0].date.getTime()
  const clampedX = Math.max(0, Math.min(width, x))
  const targetMs = xMin + (clampedX / width) * (xMax - xMin)

  let best = points[0]
  let bestDistance = Math.abs(best.date.getTime() - targetMs)
  for (const point of points) {
    const distance = Math.abs(point.date.getTime() - targetMs)
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

function resolveGapThresholdMs(points: TelemetryChartPoint[], gapMultiplier: number): number {
  const deltas: number[] = []
  for (let i = 1; i < points.length; i += 1) {
    const delta = points[i].date.getTime() - points[i - 1].date.getTime()
    if (delta > 0) deltas.push(delta)
  }
  if (deltas.length === 0) return Number.POSITIVE_INFINITY
  const sorted = [...deltas].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  return Math.max(1, median * gapMultiplier)
}

export function splitChartLineSegments(
  points: TelemetryChartPoint[],
  range: { y: { min: number; max: number } },
  width: number,
  height: number,
  windowMs?: number,
  gapMultiplier = DEFAULT_GAP_MULTIPLIER,
): Array<Array<{ x: number; y: number }>> {
  if (points.length === 0 || width <= 0) return []
  const gapThresholdMs = resolveGapThresholdMs(points, gapMultiplier)
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    const position = getChartPosition(points, point, range, width, height, windowMs)
    if (!position) continue

    if (i > 0) {
      const prev = points[i - 1]
      const deltaMs = point.date.getTime() - prev.date.getTime()
      if (deltaMs > gapThresholdMs && current.length > 0) {
        if (current.length >= 2) segments.push(current)
        current = []
      }
    }

    current.push(position)
  }

  if (current.length >= 2) segments.push(current)
  return segments
}
