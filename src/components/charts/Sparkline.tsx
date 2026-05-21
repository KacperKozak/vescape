import { useCallback, useMemo, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { LayoutChangeEvent } from 'react-native'
import Svg, { Circle as SvgCircle, Polyline as SvgPolyline } from 'react-native-svg'

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
 * Lightweight sparkline. Draws a polyline of recent values. When `fmtMax` is
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

  const { polyPoints, baselineY, firstX, maxPos, maxValue } = useMemo(() => {
    const inset = 1.5
    if (points.length < 2 || width < 1) {
      let emptyY = height / 2
      if (range) {
        const span = range.max - range.min
        if (span > 0) {
          const t = (0 - range.min) / span
          emptyY = height - inset - (height - inset * 2) * t
        }
      }
      return {
        polyPoints: '',
        baselineY: emptyY,
        firstX: 0,
        maxPos: null as { x: number; y: number } | null,
        maxValue: null,
      }
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
      return { polyPoints: '', baselineY: height / 2, firstX: 0, maxPos: null, maxValue: null }
    }

    let maxV = -Infinity
    let maxIdx = 0
    reduced.forEach((p, i) => {
      if (p.value > maxV) {
        maxV = p.value
        maxIdx = i
      }
    })

    const project = (p: SparklinePoint) => {
      const x = ((p.ts - xMin) / xSpan) * width
      const t = (p.value - yMin) / ySpan
      const y = height - inset - (height - inset * 2) * t
      return { x, y }
    }

    const firstProj = project(reduced[0])

    return {
      polyPoints: reduced.map((p) => `${project(p).x},${project(p).y}`).join(' '),
      baselineY: firstProj.y,
      firstX: firstProj.x,
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
            <Text style={{ color: maxValue != null ? color : '#475569' }}>
              {maxValue != null ? formatMaxBadgeValue(maxValue) : '-'}
            </Text>
          </Text>
        </View>
      ) : null}
      <View style={{ height }} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width="100%" height={height}>
            {firstX > 0 || !polyPoints ? (
              <SvgPolyline
                points={`0,${baselineY} ${polyPoints ? firstX : width},${baselineY}`}
                fill="none"
                stroke="#334155"
                strokeWidth={1}
                strokeLinecap="round"
              />
            ) : null}
            {polyPoints ? (
              <>
                <SvgPolyline
                  points={polyPoints}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {showMax && maxPos && (
                  <SvgCircle
                    cx={maxPos.x}
                    cy={maxPos.y}
                    r={2.5}
                    fill={color}
                    stroke="#0f172a"
                    strokeWidth={1}
                  />
                )}
              </>
            ) : null}
          </Svg>
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
    color: '#64748b',
    fontWeight: '400',
  },
})
