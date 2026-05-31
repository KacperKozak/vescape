import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import Svg, {
  Circle as SvgCircle,
  Defs as SvgDefs,
  LinearGradient as SvgLinearGradient,
  Line as SvgLine,
  Polyline as SvgPolyline,
  Rect as SvgRect,
  Stop as SvgStop,
} from 'react-native-svg'

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
const EXCLUSION_MARKER_HEIGHT = 1
const EXCLUSION_MARKER_INSET = 1

function exclusionColor(reason: string): string {
  if (reason === 'free_spin') return theme.highlight.color
  return theme.neutral.textSecondary
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
  if (abs >= 100) return Math.round(value).toString()
  return value.toFixed(1)
}

function resolveActiveChartColor(
  currentPoint: TelemetryChartPoint | null,
  baseColor: string,
  getPointColor?: (value: number) => string,
): string {
  if (!currentPoint || !getPointColor) return baseColor
  return getPointColor(currentPoint.value)
}

interface TelemetryLineChartProps {
  label: string
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
}

interface ChartLineSegmentsProps {
  points: TelemetryChartPoint[]
  range: { y: { min: number; max: number } }
  width: number
  height: number
  color: string
  getPointColor?: (value: number) => string
  gradientIdPrefix: string
  windowMs?: number
}

const ChartLineSegments = memo(function ChartLineSegments({
  points,
  range,
  width,
  height,
  color,
  getPointColor,
  gradientIdPrefix,
  windowMs,
}: ChartLineSegmentsProps) {
  const polylineSegments = useMemo(
    () =>
      width > 0
        ? splitChartLineSegments(points, range, width, height, windowMs)
            .map((segment) => segment.map((point) => `${point.x},${point.y}`).join(' '))
            .filter((segment) => segment.length > 0)
        : [],
    [height, points, range, width, windowMs],
  )
  const coloredLineSegments = useMemo(
    () =>
      getPointColor && width > 0
        ? splitChartPointSegments(points, range, width, height, windowMs).map(
            (segment, segmentIndex) => ({
              key: `${segmentIndex}`,
              gradientId: `${gradientIdPrefix}-${segmentIndex}`,
              points: segment.map((point) => `${point.x},${point.y}`).join(' '),
              stops: segment.map((point) => ({
                offset: `${Math.max(0, Math.min(1, point.x / width)) * 100}%`,
                color: getPointColor(point.point.value),
              })),
            }),
          )
        : [],
    [getPointColor, gradientIdPrefix, height, points, range, width, windowMs],
  )

  if (getPointColor) {
    return (
      <>
        <SvgDefs>
          {coloredLineSegments.map((segment) => (
            <SvgLinearGradient
              key={segment.gradientId}
              id={segment.gradientId}
              x1={0}
              y1={0}
              x2={width}
              y2={0}
              gradientUnits="userSpaceOnUse"
            >
              {segment.stops.map((stop, index) => (
                <SvgStop
                  key={`${segment.gradientId}-${index}`}
                  offset={stop.offset}
                  stopColor={stop.color}
                />
              ))}
            </SvgLinearGradient>
          ))}
        </SvgDefs>
        {coloredLineSegments.map((segment) => (
          <SvgPolyline
            key={segment.key}
            points={segment.points}
            fill="none"
            stroke={`url(#${segment.gradientId})`}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </>
    )
  }

  return polylineSegments.map((segment, index) => (
    <SvgPolyline
      key={`segment-${index}`}
      points={segment}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ))
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
}: TelemetryLineChartProps) {
  'use no memo'
  const gradientIdPrefix = `telemetry-line-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
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
    let left = markerPosition.x - half
    if (left < 0) left = 0
    if (left + TOOLTIP_WIDTH > chartWidth) left = chartWidth - TOOLTIP_WIDTH
    return left
  }, [chartWidth, markerPosition])

  const activeColor = resolveActiveChartColor(currentPoint, color, getPointColor)

  return (
    <View style={[styles.card, containerStyle]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.headerRight}>
          {isDragging && currentPoint && (
            <Text style={styles.headerTime}>{formatTime(currentPoint.date)}</Text>
          )}
          <Text style={[styles.value, isDragging && { color: activeColor }]}>{value}</Text>
        </View>
      </View>

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
          <Svg width="100%" height={height}>
            <SvgLine
              x1={0}
              y1={0.5}
              x2={chartWidth}
              y2={0.5}
              stroke={theme.neutral.surface}
              strokeWidth={0.5}
            />
            <SvgLine
              x1={0}
              y1={height / 2}
              x2={chartWidth}
              y2={height / 2}
              stroke={theme.neutral.surface}
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
            <SvgLine
              x1={0}
              y1={height - 0.5}
              x2={chartWidth}
              y2={height - 0.5}
              stroke={theme.neutral.surface}
              strokeWidth={0.5}
            />

            {excludedRanges?.map((range) => {
              const x1 = getXPosition(points, range.startMs, chartWidth, windowMs)
              const x2 = getXPosition(points, range.endMs, chartWidth, windowMs)
              if (x1 == null || x2 == null) return null
              const bandWidth = Math.max(x2 - x1, 2)
              return (
                <SvgRect
                  key={`${range.reason}-${range.startMs}-${range.endMs}`}
                  x={x1}
                  y={height - EXCLUSION_MARKER_HEIGHT - EXCLUSION_MARKER_INSET}
                  width={bandWidth}
                  height={EXCLUSION_MARKER_HEIGHT}
                  rx={0.5}
                  fill={exclusionColor(range.reason)}
                  fillOpacity={0.85}
                />
              )
            })}

            <ChartLineSegments
              points={points}
              range={range}
              width={chartWidth}
              height={height}
              color={color}
              getPointColor={getPointColor}
              gradientIdPrefix={gradientIdPrefix}
              windowMs={windowMs}
            />

            {markerPosition && isDragging && (
              <SvgLine
                x1={markerPosition.x}
                y1={0}
                x2={markerPosition.x}
                y2={height}
                stroke={theme.neutral.textDim}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            )}

            {markerPosition && (
              <SvgCircle
                cx={markerPosition.x}
                cy={markerPosition.y}
                r={4}
                fill={theme.neutral.surfaceDeep}
                stroke={activeColor}
                strokeWidth={2}
              />
            )}
          </Svg>

          {isDragging && currentPoint && markerPosition && (
            <View style={[styles.tooltip, { left: tooltipLeft }]}>
              <Text style={styles.tooltipValue}>
                {formatValue ? formatValue(currentPoint.value) : currentPoint.value.toFixed(1)}
              </Text>
              <Text style={styles.tooltipTime}>{formatTime(currentPoint.date)}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.xAxis, { marginLeft: Y_AXIS_WIDTH }]}>
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
    paddingHorizontal: 8,
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
    color: theme.neutral.textMuted,
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: theme.neutral.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  value: {
    color: theme.neutral.textPrimary,
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
  yLabel: {
    color: theme.neutral.textDim,
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
    color: theme.neutral.textDim,
    fontSize: 8,
    fontVariant: ['tabular-nums'],
  },
  xLabelHidden: {
    opacity: 0,
  },
  tooltip: {
    position: 'absolute',
    top: 4,
    width: TOOLTIP_WIDTH,
    backgroundColor: theme.neutral.surfaceDeep,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tooltipValue: {
    color: theme.neutral.textPrimary,
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tooltipTime: {
    color: theme.neutral.textMuted,
    fontSize: 8,
    fontVariant: ['tabular-nums'],
  },
})
