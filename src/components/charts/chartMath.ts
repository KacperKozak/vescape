export interface TelemetryChartPoint {
  date: Date
  value: number
}

export interface TelemetryChartRange {
  y: { min: number; max: number }
}

interface TelemetryChartXDomain {
  minMs: number
  maxMs: number
}

function getTimeDomain(
  points: TelemetryChartPoint[],
  windowMs?: number,
  xDomain?: TelemetryChartXDomain,
): TelemetryChartXDomain | null {
  if (points.length < 2) return null
  if (xDomain && xDomain.maxMs > xDomain.minMs) return xDomain

  const maxMs = points[points.length - 1].date.getTime()
  return {
    minMs: windowMs ? maxMs - windowMs : points[0].date.getTime(),
    maxMs,
  }
}

export function computeAutoRange(
  points: TelemetryChartPoint[],
  options?: {
    includeZero?: boolean
    minSpan?: number
    paddingRatio?: number
    fallbackMin?: number
    fallbackMax?: number
    baseline?: { min: number; max: number }
  },
): TelemetryChartRange {
  const includeZero = options?.includeZero ?? false
  const minSpan = options?.minSpan ?? 0
  const paddingRatio = options?.paddingRatio ?? 0
  const fallbackMin = options?.fallbackMin ?? options?.baseline?.min ?? -1
  const fallbackMax = options?.fallbackMax ?? options?.baseline?.max ?? 1

  if (!points.length) return { y: { min: fallbackMin, max: fallbackMax } }

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const point of points) {
    min = Math.min(min, point.value)
    max = Math.max(max, point.value)
  }

  if (options?.baseline) {
    min = Math.min(min, options.baseline.min)
    max = Math.max(max, options.baseline.max)
  }

  if (includeZero) {
    if (min > 0) min = 0
    if (max < 0) max = 0
  }

  const span = Math.max(minSpan, max - min)
  const pad = span * paddingRatio
  return { y: { min: min - pad, max: max + pad } }
}

export function getChartPosition(
  points: TelemetryChartPoint[],
  point: TelemetryChartPoint,
  range: { y: { min: number; max: number } },
  width: number,
  height: number,
  windowMs?: number,
  xDomain?: TelemetryChartXDomain,
): { x: number; y: number } | null {
  const domain = getTimeDomain(points, windowMs, xDomain)
  if (!domain) return null
  const xSpan = domain.maxMs - domain.minMs
  const ySpan = range.y.max - range.y.min
  if (xSpan <= 0 || ySpan <= 0) return null

  const inset = 2
  const x = width * ((point.date.getTime() - domain.minMs) / xSpan)
  const t = (point.value - range.y.min) / ySpan
  const y = height - inset - (height - inset * 2) * t
  return {
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y)),
  }
}

export function findNearestChartPointAtX(
  points: TelemetryChartPoint[],
  x: number,
  width: number,
  windowMs?: number,
  xDomain?: TelemetryChartXDomain,
): TelemetryChartPoint | null {
  if (points.length === 0 || width <= 0) return null
  const domain = getTimeDomain(points, windowMs, xDomain)
  if (!domain) return null
  const clampedX = Math.max(0, Math.min(width, x))
  const targetMs = domain.minMs + (clampedX / width) * (domain.maxMs - domain.minMs)

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
