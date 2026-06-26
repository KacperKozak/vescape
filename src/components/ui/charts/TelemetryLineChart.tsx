import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, TextInput, View } from 'react-native'
import type { LayoutChangeEvent, StyleProp, TextStyle, ViewStyle } from 'react-native'
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
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
const EMPTY_MARKER_TABLE: MarkerTable = {
  ts: [],
  xs: [],
  ys: [],
  colors: [],
  valueStrs: [],
  timeStrs: [],
}

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

interface MarkerTable {
  ts: number[]
  xs: number[]
  ys: number[]
  colors: string[]
  valueStrs: string[]
  timeStrs: string[]
  secondaryValueStrs?: string[]
}

function setSharedValue<T>(shared: SharedValue<T>, value: T) {
  shared.value = value
}

function pickMarkerIndex(table: MarkerTable, timeMs: number | null): number {
  'worklet'
  const count = table.ts.length
  if (count === 0 || timeMs == null) return -1
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (table.ts[mid] < timeMs) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return 0
  const prev = lo - 1
  return Math.abs(table.ts[prev] - timeMs) <= Math.abs(table.ts[lo] - timeMs) ? prev : lo
}

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

function valueAtTime(points: TelemetryChartPoint[], timeMs: number): TelemetryChartPoint | null {
  if (points.length === 0) return null
  let best = points[0]
  let bestDistance = Math.abs(best.date.getTime() - timeMs)
  for (const point of points) {
    const distance = Math.abs(point.date.getTime() - timeMs)
    if (distance < bestDistance) {
      best = point
      bestDistance = distance
    }
  }
  return best
}

function buildMarkerTable({
  points,
  range,
  width,
  height,
  color,
  getPointColor,
  formatValue,
  windowMs,
  secondary,
}: {
  points: TelemetryChartPoint[]
  range: { y: { min: number; max: number } }
  width: number
  height: number
  color: string
  getPointColor?: (value: number) => string
  formatValue?: (value: number) => string
  windowMs?: number
  secondary?: SecondaryChartSeries
}): MarkerTable {
  if (width < 1 || points.length < 1) return EMPTY_MARKER_TABLE
  const table: MarkerTable = {
    ts: [],
    xs: [],
    ys: [],
    colors: [],
    valueStrs: [],
    timeStrs: [],
    secondaryValueStrs: secondary ? [] : undefined,
  }
  for (const point of points) {
    const position = getChartPosition(points, point, range, width, height, windowMs)
    if (!position) continue
    const timeMs = point.date.getTime()
    table.ts.push(timeMs)
    table.xs.push(position.x)
    table.ys.push(position.y)
    table.colors.push(getPointColor ? getPointColor(point.value) : color)
    table.valueStrs.push(formatValue ? formatValue(point.value) : point.value.toFixed(1))
    table.timeStrs.push(formatTime(point.date))
    if (secondary && table.secondaryValueStrs) {
      const secondaryPoint = valueAtTime(secondary.points, timeMs)
      table.secondaryValueStrs.push(
        secondaryPoint
          ? secondary.formatValue
            ? secondary.formatValue(secondaryPoint.value)
            : secondary.value
          : '-',
      )
    }
  }
  return table
}

function AnimatedChartText({ text, style }: { text: { readonly value: string }; style?: unknown }) {
  const animatedProps = useAnimatedProps(() => {
    const value = text.value
    return { text: value, value, defaultValue: value }
  })
  return (
    <AnimatedTextInput
      editable={false}
      caretHidden
      pointerEvents="none"
      underlineColorAndroid="transparent"
      style={[styles.animatedText, style as StyleProp<TextStyle>]}
      animatedProps={animatedProps}
    />
  )
}

export interface SecondaryChartSeries {
  points: TelemetryChartPoint[]
  range: { y: { min: number; max: number } }
  color: string
  /** Display value for the current/selected time, shown in the header. */
  value: string
  formatValue?: (value: number) => string
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
  scrubTimeMs?: SharedValue<number | null>
  onScrubTimeChange?: (timeMs: number) => void
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
  scrubTimeMs,
  onScrubTimeChange,
}: TelemetryLineChartProps) {
  'use no memo'
  const [chartWidth, setChartWidth] = useState(0)
  const [chartPageX, setChartPageX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const internalScrubTimeMs = useSharedValue<number | null>(null)
  const activeScrubTimeMs = scrubTimeMs ?? internalScrubTimeMs
  const currentTimeMs = useSharedValue<number | null>(currentPoint?.date.getTime() ?? null)
  const graphRef = useRef<View>(null)
  const onPointSelectedRef = useRef(onPointSelected)
  const onGestureStartRef = useRef(onGestureStart)
  const onScrubTimeChangeRef = useRef(onScrubTimeChange)
  const activeSelectionRef = useRef<TelemetryChartPoint | null>(null)

  useEffect(() => {
    onPointSelectedRef.current = onPointSelected
    onGestureStartRef.current = onGestureStart
    onScrubTimeChangeRef.current = onScrubTimeChange
  })

  useEffect(() => {
    setSharedValue(currentTimeMs, currentPoint?.date.getTime() ?? null)
  }, [currentPoint, currentTimeMs])

  const onGraphLayout = useCallback((event: LayoutChangeEvent) => {
    setChartWidth(Math.round(event.nativeEvent.layout.width))
    graphRef.current?.measure((_x, _y, _width, _height, pageX) => {
      setChartPageX(pageX)
    })
  }, [])

  const markerTable = useMemo(
    () =>
      buildMarkerTable({
        points,
        range,
        width: chartWidth,
        height,
        color,
        getPointColor,
        formatValue,
        windowMs,
        secondary,
      }),
    [chartWidth, color, formatValue, getPointColor, height, points, range, secondary, windowMs],
  )
  const markerTableSV = useSharedValue<MarkerTable>(markerTable)

  useEffect(() => {
    setSharedValue(markerTableSV, markerTable)
  }, [markerTable, markerTableSV])

  const liveIdx = useDerivedValue(() =>
    pickMarkerIndex(markerTableSV.value, activeScrubTimeMs.value ?? currentTimeMs.value),
  )
  const markerX = useDerivedValue(() => {
    const idx = liveIdx.value
    return idx >= 0 ? markerTableSV.value.xs[idx] : -100
  })
  const markerY = useDerivedValue(() => {
    const idx = liveIdx.value
    return idx >= 0 ? markerTableSV.value.ys[idx] : -100
  })
  const markerColor = useDerivedValue(() => {
    const idx = liveIdx.value
    return idx >= 0 ? markerTableSV.value.colors[idx] : color
  })
  const markerLineTop = useDerivedValue(() => vec(markerX.value, 0))
  const markerLineBottom = useDerivedValue(() => vec(markerX.value, height))
  const liveValueText = useDerivedValue(() => {
    const idx = liveIdx.value
    return idx >= 0 ? markerTableSV.value.valueStrs[idx] : value
  })
  const liveTimeText = useDerivedValue(() => {
    const idx = liveIdx.value
    return idx >= 0 ? markerTableSV.value.timeStrs[idx] : ''
  })
  const liveSecondaryValueText = useDerivedValue(() => {
    const idx = liveIdx.value
    const values = markerTableSV.value.secondaryValueStrs
    return idx >= 0 && values ? values[idx] : (secondary?.value ?? '-')
  })
  const tooltipAnimatedStyle = useAnimatedStyle(() => {
    const half = TOOLTIP_WIDTH / 2
    const cardChartLeft = CARD_HORIZONTAL_PADDING + Y_AXIS_WIDTH
    const cardChartRight = cardChartLeft + chartWidth
    let left = cardChartLeft + markerX.value - half
    if (left < CARD_HORIZONTAL_PADDING) left = CARD_HORIZONTAL_PADDING
    if (left + TOOLTIP_WIDTH > cardChartRight) left = cardChartRight - TOOLTIP_WIDTH
    return { left }
  })
  const liveValueColorStyle = useAnimatedStyle(() => ({ color: markerColor.value }))

  const selectAtPageX = useCallback(
    (x: number) => {
      const point = findNearestChartPointAtX(points, x - chartPageX, chartWidth, windowMs)
      activeSelectionRef.current = point
      if (!point) return
      const timeMs = point.date.getTime()
      setSharedValue(activeScrubTimeMs, timeMs)
      onScrubTimeChangeRef.current?.(timeMs)
    },
    [activeScrubTimeMs, chartPageX, chartWidth, points, windowMs],
  )

  const panResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- refs only read inside PanResponder callbacks, not during render
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          points.length > 0 &&
          chartWidth > 0 &&
          (!!onPointSelectedRef.current || !!onScrubTimeChangeRef.current),
        onMoveShouldSetPanResponder: () =>
          points.length > 0 &&
          chartWidth > 0 &&
          (!!onPointSelectedRef.current || !!onScrubTimeChangeRef.current),
        onPanResponderGrant: (_event, gesture) => {
          setIsDragging(true)
          onGestureStartRef.current?.()
          selectAtPageX(gesture.x0)
        },
        onPanResponderMove: (_event, gesture) => {
          selectAtPageX(gesture.moveX)
        },
        onPanResponderRelease: () => {
          setIsDragging(false)
          setSharedValue(activeScrubTimeMs, null)
          const point = activeSelectionRef.current
          activeSelectionRef.current = null
          if (point) onPointSelectedRef.current?.(point)
        },
        onPanResponderTerminate: () => {
          setIsDragging(false)
          setSharedValue(activeScrubTimeMs, null)
          activeSelectionRef.current = null
        },
      }),
    [activeScrubTimeMs, chartWidth, points.length, selectAtPageX],
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

  const activeColor = resolveActiveChartColor(currentPoint, color, getPointColor)
  const valueColorStyle = getPointColor && currentPoint ? { color: activeColor } : undefined
  const hasMarker = markerTable.ts.length > 0

  return (
    <View style={[styles.card, containerStyle]}>
      <View style={styles.header}>
        {label ? <Text style={styles.label}>{label}</Text> : <View />}
        <View style={styles.headerRight}>
          {isDragging && <AnimatedChartText text={liveTimeText} style={styles.headerTime} />}
          <AnimatedChartText
            text={liveValueText}
            style={[
              styles.value,
              secondary ? { color } : valueColorStyle,
              getPointColor && !secondary ? liveValueColorStyle : undefined,
            ]}
          />
        </View>
      </View>

      {isDragging && hasMarker && (
        <Animated.View style={[styles.tooltip, tooltipAnimatedStyle]}>
          <View style={styles.tooltipValues}>
            <AnimatedChartText
              text={liveValueText}
              style={[styles.tooltipValue, { color: activeColor }, liveValueColorStyle]}
            />
            {secondary && (
              <AnimatedChartText
                text={liveSecondaryValueText}
                style={[styles.tooltipValue, { color: secondary.color }]}
              />
            )}
          </View>
          <AnimatedChartText text={liveTimeText} style={styles.tooltipTime} />
        </Animated.View>
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
            </Canvas>
          )}
          {chartWidth > 0 && hasMarker && (
            <Canvas style={[styles.markerCanvas, { width: chartWidth, height }]}>
              {isDragging && (
                <Line
                  p1={markerLineTop}
                  p2={markerLineBottom}
                  color={theme.palette.slate.textDim}
                  strokeWidth={1}
                >
                  <DashPathEffect intervals={[3, 3]} />
                </Line>
              )}

              <Circle cx={markerX} cy={markerY} r={4} color={theme.palette.slate.surfaceDeep} />
              <Circle
                cx={markerX}
                cy={markerY}
                r={4}
                color={markerColor}
                style="stroke"
                strokeWidth={2}
              />
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
  markerCanvas: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
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
  animatedText: {
    padding: 0,
    margin: 0,
  },
})
