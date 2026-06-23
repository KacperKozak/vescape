import { Circle, Path, Skia } from '@shopify/react-native-skia'

export interface SparklinePoint {
  ts: number
  value: number
}

export interface SparklineRange {
  min: number
  max: number
}

export interface SparklinePathOptions {
  points: SparklinePoint[]
  width: number
  height: number
  range?: SparklineRange
  minSpan?: number
  windowMs?: number
}

export interface SparklinePaths {
  linePath: ReturnType<typeof Skia.Path.Make> | null
  baselinePath: ReturnType<typeof Skia.Path.Make> | null
  maxPos: { x: number; y: number } | null
}

const MIN_BUCKETS = 50
const BASELINE_COLOR = '#334155'
const MAX_DOT_STROKE = '#0f172a'

function downsampleMinMax(points: SparklinePoint[], bucketCount: number): SparklinePoint[] {
  if (points.length <= bucketCount * 2) return points

  const tMin = points[0].ts
  const tMax = points[points.length - 1].ts
  const tSpan = tMax - tMin
  if (tSpan <= 0) return points

  const result: SparklinePoint[] = []
  const bucketWidth = tSpan / bucketCount
  let bi = 0
  let minP: SparklinePoint | null = null
  let maxP: SparklinePoint | null = null

  for (const p of points) {
    const bucket = Math.min(Math.floor((p.ts - tMin) / bucketWidth), bucketCount - 1)
    if (bucket !== bi) {
      if (minP && maxP) {
        if (minP === maxP) result.push(minP)
        else if (minP.ts <= maxP.ts) result.push(minP, maxP)
        else result.push(maxP, minP)
      }
      minP = null
      maxP = null
      bi = bucket
    }
    if (!minP || p.value < minP.value) minP = p
    if (!maxP || p.value > maxP.value) maxP = p
  }

  if (minP && maxP) {
    if (minP === maxP) result.push(minP)
    else if (minP.ts <= maxP.ts) result.push(minP, maxP)
    else result.push(maxP, minP)
  }
  return result
}

export function buildSparklinePaths({
  points,
  width,
  height,
  range,
  minSpan = 0,
  windowMs,
}: SparklinePathOptions): SparklinePaths {
  const inset = 1.5
  const empty: SparklinePaths = { linePath: null, baselinePath: null, maxPos: null }
  const makeBaseline = (fromX: number, toX: number, y: number) =>
    Skia.PathBuilder.Make().moveTo(fromX, y).lineTo(toX, y).detach()

  if (width < 1) return empty
  if (points.length === 1) {
    const point = points[0]
    let yMin = range?.min ?? point.value - minSpan / 2
    let yMax = range?.max ?? point.value + minSpan / 2
    if (yMax <= yMin) {
      yMin = point.value - 1
      yMax = point.value + 1
    }
    const t = Math.max(0, Math.min(1, (point.value - yMin) / (yMax - yMin)))
    const y = height - inset - (height - inset * 2) * t
    return { ...empty, baselinePath: makeBaseline(0, width, y), maxPos: { x: width, y } }
  }
  if (points.length < 2) return { ...empty, baselinePath: makeBaseline(0, width, height / 2) }

  const reduced = downsampleMinMax(points, Math.max(width, MIN_BUCKETS))
  const xMax = reduced[reduced.length - 1].ts
  const xMin = windowMs ? xMax - windowMs : reduced[0].ts
  const xSpan = xMax - xMin
  let yMin = range?.min ?? Number.POSITIVE_INFINITY
  let yMax = range?.max ?? Number.NEGATIVE_INFINITY
  if (!range) {
    for (const p of reduced) {
      if (p.value < yMin) yMin = p.value
      if (p.value > yMax) yMax = p.value
    }
    const span = yMax - yMin
    if (span < minSpan) {
      const mid = (yMax + yMin) / 2
      yMin = mid - minSpan / 2
      yMax = mid + minSpan / 2
    } else {
      const pad = span * 0.1 || 1
      yMin -= pad
      yMax += pad
    }
  }
  const ySpan = yMax - yMin
  if (xSpan <= 0 || ySpan <= 0)
    return { ...empty, baselinePath: makeBaseline(0, width, height / 2) }

  const project = (p: SparklinePoint) => ({
    x: ((p.ts - xMin) / xSpan) * width,
    y: height - inset - (height - inset * 2) * ((p.value - yMin) / ySpan),
  })
  let maxIndex = 0
  for (let i = 1; i < reduced.length; i += 1) {
    if (reduced[i].value > reduced[maxIndex].value) maxIndex = i
  }
  const first = project(reduced[0])
  const builder = Skia.PathBuilder.Make().moveTo(first.x, first.y)
  for (let i = 1; i < reduced.length; i += 1) {
    const point = project(reduced[i])
    builder.lineTo(point.x, point.y)
  }
  return {
    linePath: builder.detach(),
    baselinePath: first.x > 0 ? makeBaseline(0, first.x, first.y) : null,
    maxPos: project(reduced[maxIndex]),
  }
}

interface SparklineLayerProps {
  paths: SparklinePaths
  color: string
  showMax?: boolean
}

/** Draw-only layer. Parent owns Canvas, so many lines share one GPU surface. */
export function SparklineLayer({ paths, color, showMax = false }: SparklineLayerProps) {
  return (
    <>
      {paths.baselinePath ? (
        <Path
          path={paths.baselinePath}
          color={BASELINE_COLOR}
          style="stroke"
          strokeWidth={1}
          strokeCap="round"
        />
      ) : null}
      {paths.linePath ? (
        <Path
          path={paths.linePath}
          color={color}
          style="stroke"
          strokeWidth={1.5}
          strokeCap="round"
          strokeJoin="round"
        />
      ) : null}
      {showMax && paths.maxPos ? (
        <>
          <Circle cx={paths.maxPos.x} cy={paths.maxPos.y} r={2.5} color={color} />
          <Circle
            cx={paths.maxPos.x}
            cy={paths.maxPos.y}
            r={2.5}
            color={MAX_DOT_STROKE}
            style="stroke"
            strokeWidth={1}
          />
        </>
      ) : null}
    </>
  )
}
