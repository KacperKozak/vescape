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
  /** Optional fixed Y range. Overrides auto-range. */
  range?: { min: number; max: number }
  /**
   * Auto-range only: enforce a minimum Y-axis span. Prevents tiny variations
   * (e.g. 1°C jitter on temperature) from filling the whole chart. The data
   * mid-point stays centered.
   */
  minSpan?: number
}

const DEFAULT_HEIGHT = 28
const BADGE_ROW_HEIGHT = 12

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
  range,
  minSpan = 0,
}: SparklineProps) {
  const showMax = !!fmtMax
  const [width, setWidth] = useState(0)
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width))
  }, [])

  const { polyPoints, maxPos, maxValue } = useMemo(() => {
    if (points.length < 2 || width < 1) {
      return { polyPoints: '', maxPos: null as { x: number; y: number } | null, maxValue: null }
    }
    const xMin = points[0].ts
    const xMax = points[points.length - 1].ts
    const xSpan = xMax - xMin

    let yMin: number
    let yMax: number
    if (range) {
      yMin = range.min
      yMax = range.max
    } else {
      yMin = Number.POSITIVE_INFINITY
      yMax = Number.NEGATIVE_INFINITY
      for (const p of points) {
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
      return { polyPoints: '', maxPos: null, maxValue: null }
    }

    let maxV = -Infinity
    let maxIdx = 0
    points.forEach((p, i) => {
      if (p.value > maxV) {
        maxV = p.value
        maxIdx = i
      }
    })

    const project = (p: SparklinePoint) => {
      const x = ((p.ts - xMin) / xSpan) * width
      const y = height - ((p.value - yMin) / ySpan) * height
      return { x, y }
    }

    return {
      polyPoints: points.map((p) => `${project(p).x},${project(p).y}`).join(' '),
      maxPos: project(points[maxIdx]),
      maxValue: maxV,
    }
  }, [points, width, height, range, minSpan])

  return (
    <View style={styles.wrap}>
      {showMax ? (
        <View style={[styles.badgeRow, { height: BADGE_ROW_HEIGHT }]}>
          {maxValue != null && fmtMax ? (
            <Text style={[styles.maxBadge, { color }]} numberOfLines={1}>
              max {fmtMax(maxValue)}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ height }} onLayout={onLayout}>
        {polyPoints ? (
          <Svg width="100%" height={height}>
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
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  maxBadge: {
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
})
