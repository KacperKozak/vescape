export interface TelemetryChartPoint {
  date: Date
  value: number
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
): { y: { min: number; max: number } } {
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
): { x: number; y: number } | null {
  if (points.length < 2) return null
  const xMin = points[0].date.getTime()
  const xMax = points[points.length - 1].date.getTime()
  const xSpan = xMax - xMin
  const ySpan = range.y.max - range.y.min
  if (xSpan <= 0 || ySpan <= 0) return null

  const x = width * ((point.date.getTime() - xMin) / xSpan)
  const y = height - height * ((point.value - range.y.min) / ySpan)
  return {
    x: Math.max(0, Math.min(width, x)),
    y: Math.max(0, Math.min(height, y)),
  }
}

export function findNearestChartPointAtX(
  points: TelemetryChartPoint[],
  x: number,
  width: number,
): TelemetryChartPoint | null {
  if (points.length === 0 || width <= 0) return null
  const xMin = points[0].date.getTime()
  const xMax = points[points.length - 1].date.getTime()
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
