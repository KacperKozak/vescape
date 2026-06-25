import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import {
  Canvas,
  Circle,
  DashPathEffect,
  Line,
  LinearGradient,
  Path,
  RoundedRect,
  Skia,
  vec,
} from '@shopify/react-native-skia'

import { theme } from '@/constants/theme'
import {
  findNearestChartPointAtX,
  getChartPosition,
  getXPosition,
  splitChartPointSegments,
  splitChartLineSegments,
  type ExcludedRange,
  type TelemetryChartPoint,
} from './chartMath'

const DEFAULT_HEIGHT = 54
const Y_AXIS_WIDTH = 34
const TOOLTIP_WIDTH = 94
const CARD_HORIZONTAL_PADDING = 8
const EXCLUSION_MARKER_HEIGHT = 1
const EXCLUSION_MARKER_INSET = 1

function exclusionColor(reason: string): string {
  if (reason === 'free_spin') return theme.palette.yellow.color
  return theme.palette.slate.textSecondary
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function formatRelativeTime(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return `-${diffSec}s`
  const diffMin = Math.round(diffSec / 60)
  return `-${diffMin}m`
}

function formatAxisNumber(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 100 || Number.isInteger(value)) return Math.round(value).toString()
  return value.toFixed(1)
}

function buildLinePath(coords: { x: number; y: number }[]) {
  const builder = Skia.PathBuilder.Make().moveTo(coords[0].x, coords[0].y)
  for (let i = 1; i < coords.length; i += 1) builder.lineTo(coords[i].x, coords[i].y)
  return builder.detach()
}

function resolveActiveChartColor(
  currentPoint: TelemetryChartPoint | null,
  baseColor: string,
  getPointColor?: (value: number) => string,
): string {
  if (!currentPoint || !getPointColor) return baseColor
  return getPointColor(currentPoint.value)
}

export interface SecondaryChartSeries {
  points: TelemetryChartPoint[]
  range: { y: { min: number; max: number } }
  color: string
  /** Display value for the current/selected time, shown in the header. */
  value: string
}

interface TelemetryLineChartProps {
  label?: string
  value: string
  points: TelemetryChartPoint[]
  currentPoint: TelemetryChartPoint | null
  color: string
  range: { y: { min: number; max: number } }
  height?: number
  containerStyle?: StyleProp<ViewStyle>
  onPointSelected?: (point: TelemetryChartPoint) => void
  onGestureStart?: () => void
  formatValue?: (value: number) => string
  getPointColor?: (value: number) => string
  windowMs?: number
  excludedRanges?: ExcludedRange[]
  /** Optional second line plotted on a right-side axis with its own range. */
  secondary?: SecondaryChartSeries
}

interface ChartLineSegmentsProps {
  points: TelemetryChartPoint[]
  range: { y: { min: number; max: number } }
  width: number
  height: number
  color: string
  getPointColor?: (value: number) => string
  windowMs?: number
}

const ChartLineSegments = memo(function ChartLineSegments({
  points,
  range,
  width,
  height,
  color,
  getPointColor,
  windowMs,
}: ChartLineSegmentsProps) {
  const plainPaths = useMemo(
    () =>
      !getPointColor && width > 0
        ? splitChartLineSegments(points, range, width, height, windowMs)
            .filter((segment) => segment.length >= 2)
            .map(buildLinePath)
        : [],
    [getPointColor, height, points, range, width, windowMs],
  )
  const gradientSegments = useMemo(
    () =>
      getPointColor && width > 0
        ? splitChartPointSegments(points, range, width, height, windowMs)
            .filter((segment) => segment.length >= 2)
            .map((segment) => ({
              path: buildLinePath(segment),
              colors: segment.map((point) => getPointColor(point.point.value)),
              positions: segment.map((point) => Math.max(0, Math.min(1, point.x / width))),
            }))
        : [],
    [getPointColor, height, points, range, width, windowMs],
  )

  if (getPointColor) {
    return (
      <>
        {gradientSegments.map((segment, index) => (
          <Path
            key={index}
            path={segment.path}
            style="stroke"
            strokeWidth={2}
            strokeCap="round"
            strokeJoin="round"
          >
            <LinearGradient
              start={vec(0, 0)}
              end={vec(width, 0)}
              colors={segment.colors}
              positions={segment.positions}
            />
          </Path>
        ))}
      </>
    )
  }

  return (
    <>
      {plainPaths.map((path, index) => (
        <Path
          key={index}
          path={path}
          color={color}
          style="stroke"
          strokeWidth={2}
          strokeCap="round"
          strokeJoin="round"
        />
      ))}
    </>
  )
})

export function TelemetryLineChart({
  label,
  value,
  points,
  currentPoint,
  color,
  range,
  height = DEFAULT_HEIGHT,
  containerStyle,
  onPointSelected,
  onGestureStart,
  formatValue,
  getPointColor,
  windowMs,
  excludedRanges,
  secondary,
}: TelemetryLineChartProps) {
  'use no memo'
  const [chartWidth, setChartWidth] = useState(0)
  const [chartPageX, setChartPageX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const graphRef = useRef<View>(null)
  const onPointSelectedRef = useRef(onPointSelected)
  const onGestureStartRef = useRef(onGestureStart)

  useEffect(() => {
    onPointSelectedRef.current = onPointSelected
    onGestureStartRef.current = onGestureStart
  })

  const onGraphLayout = useCallback((event: LayoutChangeEvent) => {
    setChartWidth(Math.round(event.nativeEvent.layout.width))
    graphRef.current?.measure((_x, _y, _width, _height, pageX) => {
      setChartPageX(pageX)
    })
  }, [])

  const markerPosition = useMemo(() => {
    if (!currentPoint || chartWidth < 1) return null
    return getChartPosition(points, currentPoint, range, chartWidth, height, windowMs)
  }, [chartWidth, currentPoint, height, points, range, windowMs])

  const selectAtPageX = useCallback(
    (x: number) => {
      if (!onPointSelectedRef.current) return
      const point = findNearestChartPointAtX(points, x - chartPageX, chartWidth, windowMs)
      if (!point) return
      onPointSelectedRef.current(point)
    },
    [chartPageX, chartWidth, points, windowMs],
  )

  const panResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- refs only read inside PanResponder callbacks, not during render
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          !!onPointSelectedRef.current && points.length > 0 && chartWidth > 0,
        onMoveShouldSetPanResponder: () =>
          !!onPointSelectedRef.current && points.length > 0 && chartWidth > 0,
        onPanResponderGrant: (_event, gesture) => {
          setIsDragging(true)
          onGestureStartRef.current?.()
          selectAtPageX(gesture.x0)
        },
        onPanResponderMove: (_event, gesture) => {
          selectAtPageX(gesture.moveX)
        },
        onPanResponderRelease: () => setIsDragging(false),
        onPanResponderTerminate: () => setIsDragging(false),
      }),
    [chartWidth, points.length, selectAtPageX],
  )

  const yMid = (range.y.min + range.y.max) / 2
  const secondaryYMid = secondary ? (secondary.range.y.min + secondary.range.y.max) / 2 : 0

  const timeLabels = useMemo(() => {
    if (points.length < 2) return null
    const now = points[points.length - 1].date
    const start = windowMs ? new Date(now.getTime() - windowMs) : points[0].date
    return {
      start: formatRelativeTime(start, now),
      end: 'now',
    }
  }, [points, windowMs])

  const tooltipLeft = useMemo(() => {
    if (!markerPosition || chartWidth <= 0) return 0
    const half = TOOLTIP_WIDTH / 2
    const cardChartLeft = CARD_HORIZONTAL_PADDING + Y_AXIS_WIDTH
    const cardChartRight = cardChartLeft + chartWidth
    let left = cardChartLeft + markerPosition.x - half
    if (left < CARD_HORIZONTAL_PADDING) left = CARD_HORIZONTAL_PADDING
    if (left + TOOLTIP_WIDTH > cardChartRight) left = cardChartRight - TOOLTIP_WIDTH
    return left
  }, [chartWidth, markerPosition])

  const activeColor = resolveActiveChartColor(currentPoint, color, getPointColor)
  const valueColorStyle = getPointColor && currentPoint ? { color: activeColor } : undefined

  return (
    <View style={[styles.card, containerStyle]}>
      <View style={styles.header}>
        {label ? <Text style={styles.label}>{label}</Text> : <View />}
        <View style={styles.headerRight}>
          {isDragging && currentPoint && (
            <Text style={styles.headerTime}>{formatTime(currentPoint.date)}</Text>
          )}
          <Text style={[styles.value, secondary ? { color } : valueColorStyle]}>{value}</Text>
        </View>
      </View>

      {isDragging && currentPoint && markerPosition && (
        <View style={[styles.tooltip, { left: tooltipLeft }]}>
          <View style={styles.tooltipValues}>
            <Text style={[styles.tooltipValue, { color: activeColor }]}>
              {formatValue ? formatValue(currentPoint.value) : currentPoint.value.toFixed(1)}
            </Text>
            {secondary && (
              <Text style={[styles.tooltipValue, { color: secondary.color }]}>
                {secondary.value}
              </Text>
            )}
          </View>
          <Text style={styles.tooltipTime}>{formatTime(currentPoint.date)}</Text>
        </View>
      )}

      <View style={styles.chartBody}>
        <View style={[styles.yAxis, { height }]}>
          <Text style={styles.yLabel}>{formatAxisNumber(range.y.max)}</Text>
          <Text style={styles.yLabel}>{formatAxisNumber(yMid)}</Text>
          <Text style={styles.yLabel}>{formatAxisNumber(range.y.min)}</Text>
        </View>

        <View
          ref={graphRef}
          style={[styles.graphWrap, { height }]}
          onLayout={onGraphLayout}
          {...panResponder.panHandlers}
        >
          {chartWidth > 0 && (
            <Canvas style={{ width: chartWidth, height }}>
              <Line
                p1={vec(0, 0.5)}
                p2={vec(chartWidth, 0.5)}
                color={theme.palette.slate.surface}
                strokeWidth={0.5}
              />
              <Line
                p1={vec(0, height / 2)}
                p2={vec(chartWidth, height / 2)}
                color={theme.palette.slate.surface}
                strokeWidth={0.5}
              >
                <DashPathEffect intervals={[4, 4]} />
              </Line>
              <Line
                p1={vec(0, height - 0.5)}
                p2={vec(chartWidth, height - 0.5)}
                color={theme.palette.slate.surface}
                strokeWidth={0.5}
              />

              {excludedRanges?.map((range) => {
                const x1 = getXPosition(points, range.startMs, chartWidth, windowMs)
                const x2 = getXPosition(points, range.endMs, chartWidth, windowMs)
                if (x1 == null || x2 == null) return null
                const bandWidth = Math.max(x2 - x1, 2)
                return (
                  <RoundedRect
                    key={`${range.reason}-${range.startMs}-${range.endMs}`}
                    x={x1}
                    y={height - EXCLUSION_MARKER_HEIGHT - EXCLUSION_MARKER_INSET}
                    width={bandWidth}
                    height={EXCLUSION_MARKER_HEIGHT}
                    r={0.5}
                    color={exclusionColor(range.reason)}
                    opacity={0.85}
                  />
                )
              })}

              {secondary && (
                <ChartLineSegments
                  points={secondary.points}
                  range={secondary.range}
                  width={chartWidth}
                  height={height}
                  color={secondary.color}
                  windowMs={windowMs}
                />
              )}

              <ChartLineSegments
                points={points}
                range={range}
                width={chartWidth}
                height={height}
                color={color}
                getPointColor={getPointColor}
                windowMs={windowMs}
              />

              {markerPosition && isDragging && (
                <Line
                  p1={vec(markerPosition.x, 0)}
                  p2={vec(markerPosition.x, height)}
                  color={theme.palette.slate.textDim}
                  strokeWidth={1}
                >
                  <DashPathEffect intervals={[3, 3]} />
                </Line>
              )}

              {markerPosition && (
                <>
                  <Circle
                    cx={markerPosition.x}
                    cy={markerPosition.y}
                    r={4}
                    color={theme.palette.slate.surfaceDeep}
                  />
                  <Circle
                    cx={markerPosition.x}
                    cy={markerPosition.y}
                    r={4}
                    color={activeColor}
                    style="stroke"
                    strokeWidth={2}
                  />
                </>
              )}
            </Canvas>
          )}
        </View>

        {secondary && (
          <View style={[styles.rightAxis, { height }]}>
            <Text style={styles.yLabel}>{formatAxisNumber(secondary.range.y.max)}</Text>
            <Text style={styles.yLabel}>{formatAxisNumber(secondaryYMid)}</Text>
            <Text style={styles.yLabel}>{formatAxisNumber(secondary.range.y.min)}</Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.xAxis,
          { marginLeft: Y_AXIS_WIDTH, marginRight: secondary ? Y_AXIS_WIDTH : 0 },
        ]}
      >
        <Text style={[styles.xLabel, !timeLabels && styles.xLabelHidden]}>
          {timeLabels?.start ?? '--'}
        </Text>
        <Text style={[styles.xLabel, !timeLabels && styles.xLabelHidden]}>
          {timeLabels?.end ?? '--'}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    position: 'relative',
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingTop: 6,
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTime: {
    color: theme.palette.slate.textMuted,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: theme.palette.slate.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: theme.palette.slate.textPrimary,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chartBody: {
    flexDirection: 'row',
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 4,
  },
  rightAxis: {
    width: Y_AXIS_WIDTH,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingLeft: 4,
  },
  yLabel: {
    color: theme.palette.slate.textDim,
    fontSize: 8,
    fontVariant: ['tabular-nums'],
    lineHeight: 10,
  },
  graphWrap: {
    flex: 1,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  xLabel: {
    color: theme.palette.slate.textDim,
    fontSize: 8,
    fontVariant: ['tabular-nums'],
  },
  xLabelHidden: {
    opacity: 0,
  },
  tooltip: {
    position: 'absolute',
    top: 2,
    width: TOOLTIP_WIDTH,
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  tooltipValues: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  tooltipValue: {
    color: theme.palette.slate.textPrimary,
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tooltipTime: {
    color: theme.palette.slate.textMuted,
    fontSize: 8,
    fontVariant: ['tabular-nums'],
  },
})
