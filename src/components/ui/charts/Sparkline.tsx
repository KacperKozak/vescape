import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia'
import { theme } from '@/constants/theme'

export interface SparklinePoint {
  ts: number
  value: number
}

interface SparklineProps {
  points: SparklinePoint[]
  color: string
  /** Total height of the chart strip (excludes max-badge row). */
  height?: number
  /** Optional formatter for the max-value badge + dot. Omit for clean line only. */
  fmtMax?: (value: number) => string
  /** Show/hide the max-value badge text row. Max dot still follows `fmtMax`. */
  showMaxBadge?: boolean
  /** Horizontal alignment of the max badge. Defaults to 'right'. */
  maxPosition?: 'left' | 'right'
  /** Optional fixed Y range. Overrides auto-range. */
  range?: { min: number; max: number }
  /**
   * Auto-range only: enforce a minimum Y-axis span. Prevents tiny variations
   * (e.g. 1°C jitter on temperature) from filling the whole chart. The data
   * mid-point stays centered.
   */
  minSpan?: number
  /** Fixed time window in ms. X-axis spans [now - windowMs, now]. */
  windowMs?: number
}

const DEFAULT_HEIGHT = 28
const BADGE_ROW_HEIGHT = 12
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
        if (minP === maxP) {
          result.push(minP)
        } else if (minP.ts <= maxP.ts) {
          result.push(minP, maxP)
        } else {
          result.push(maxP, minP)
        }
      }
      minP = null
      maxP = null
      bi = bucket
    }

    if (!minP || p.value < minP.value) minP = p
    if (!maxP || p.value > maxP.value) maxP = p
  }

  if (minP && maxP) {
    if (minP === maxP) {
      result.push(minP)
    } else if (minP.ts <= maxP.ts) {
      result.push(minP, maxP)
    } else {
      result.push(maxP, minP)
    }
  }

  return result
}

/**
 * Lightweight sparkline. Draws a polyline of recent values on a single Skia
 * canvas (one GPU draw, no per-segment native views). When `fmtMax` is
 * supplied, also renders a small dot at the all-time-max within the window
 * and a labeled badge above the chart (badge sits in its own row so it never
 * overlaps the line).
 */
export function Sparkline({
  points,
  color,
  height = DEFAULT_HEIGHT,
  fmtMax,
  showMaxBadge = true,
  maxPosition = 'right',
  range,
  minSpan = 0,
  windowMs,
}: SparklineProps) {
  const showMax = !!fmtMax
  const showBadge = showMax && showMaxBadge
  const formatMaxBadgeValue = useCallback(
    (value: number) => (fmtMax ? fmtMax(value).replace(/(\d)\s+([a-zA-Z%°])/g, '$1$2') : ''),
    [fmtMax],
  )
  const [width, setWidth] = useState(0)
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width))
  }, [])

  const { linePath, baselinePath, maxPos, maxValue } = useMemo(() => {
    const inset = 1.5
    const empty = {
      linePath: null as ReturnType<typeof Skia.Path.Make> | null,
      baselinePath: null as ReturnType<typeof Skia.Path.Make> | null,
      maxPos: null as { x: number; y: number } | null,
      maxValue: null as number | null,
    }

    if (width < 1) return empty

    const makeBaseline = (fromX: number, toX: number, y: number) =>
      Skia.PathBuilder.Make().moveTo(fromX, y).lineTo(toX, y).detach()

    if (points.length === 1) {
      const point = points[0]
      let yMin: number
      let yMax: number
      if (range) {
        yMin = range.min
        yMax = range.max
      } else {
        yMin = point.value - minSpan / 2
        yMax = point.value + minSpan / 2
        if (yMax <= yMin) {
          yMin = point.value - 1
          yMax = point.value + 1
        }
      }
      const t = Math.max(0, Math.min(1, (point.value - yMin) / (yMax - yMin)))
      const y = height - inset - (height - inset * 2) * t
      return {
        ...empty,
        baselinePath: makeBaseline(0, width, y),
        maxPos: { x: width, y },
        maxValue: point.value,
      }
    }

    if (points.length < 2) {
      return { ...empty, baselinePath: makeBaseline(0, width, height / 2) }
    }

    const buckets = Math.max(width, MIN_BUCKETS)
    const reduced = downsampleMinMax(points, buckets)

    const xMax = reduced[reduced.length - 1].ts
    const xMin = windowMs ? xMax - windowMs : reduced[0].ts
    const xSpan = xMax - xMin

    let yMin: number
    let yMax: number
    if (range) {
      yMin = range.min
      yMax = range.max
    } else {
      yMin = Number.POSITIVE_INFINITY
      yMax = Number.NEGATIVE_INFINITY
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
    if (xSpan <= 0 || ySpan <= 0) {
      return { ...empty, baselinePath: makeBaseline(0, width, height / 2) }
    }

    const project = (p: SparklinePoint) => {
      const x = ((p.ts - xMin) / xSpan) * width
      const t = (p.value - yMin) / ySpan
      const y = height - inset - (height - inset * 2) * t
      return { x, y }
    }

    let maxV = -Infinity
    let maxIdx = 0
    reduced.forEach((p, i) => {
      if (p.value > maxV) {
        maxV = p.value
        maxIdx = i
      }
    })

    const builder = Skia.PathBuilder.Make()
    const first = project(reduced[0])
    builder.moveTo(first.x, first.y)
    for (let i = 1; i < reduced.length; i += 1) {
      const proj = project(reduced[i])
      builder.lineTo(proj.x, proj.y)
    }

    return {
      linePath: builder.detach(),
      // Flat lead-in from the left edge to where real data begins.
      baselinePath: first.x > 0 ? makeBaseline(0, first.x, first.y) : null,
      maxPos: project(reduced[maxIdx]),
      maxValue: maxV,
    }
  }, [points, width, height, range, minSpan, windowMs])

  return (
    <View style={styles.wrap}>
      {showBadge ? (
        <View
          style={[
            styles.badgeRow,
            {
              height: BADGE_ROW_HEIGHT,
              justifyContent: maxPosition === 'left' ? 'flex-start' : 'flex-end',
            },
          ]}
        >
          <Text style={styles.maxBadge} numberOfLines={1}>
            <Text style={styles.maxLabel}>max </Text>
            <Text style={{ color: maxValue != null ? color : theme.neutral.textDim }}>
              {maxValue != null ? formatMaxBadgeValue(maxValue) : '-'}
            </Text>
          </Text>
        </View>
      ) : null}
      <View style={{ height }} onLayout={onLayout}>
        {width > 0 ? (
          <Canvas style={{ width, height }}>
            {baselinePath ? (
              <Path
                path={baselinePath}
                color={BASELINE_COLOR}
                style="stroke"
                strokeWidth={1}
                strokeCap="round"
              />
            ) : null}
            {linePath ? (
              <Path
                path={linePath}
                color={color}
                style="stroke"
                strokeWidth={1.5}
                strokeCap="round"
                strokeJoin="round"
              />
            ) : null}
            {showMax && maxPos ? (
              <>
                <Circle cx={maxPos.x} cy={maxPos.y} r={2.5} color={color} />
                <Circle
                  cx={maxPos.x}
                  cy={maxPos.y}
                  r={2.5}
                  color={MAX_DOT_STROKE}
                  style="stroke"
                  strokeWidth={1}
                />
              </>
            ) : null}
          </Canvas>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  maxBadge: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  maxLabel: {
    color: theme.neutral.textMuted,
    fontWeight: '400',
  },
})
