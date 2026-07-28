import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { AnimatedValueText } from '@/components/base/AnimatedValueText'
import { Text } from '@/components/base/Text'
import Animated, {
  runOnJS,
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
  getChartPosition,
  getXPosition,
  splitChartPointSegments,
  splitChartLineSegments,
  type ExcludedRange,
  type TelemetryChartPoint,
} from '@/components/charts/chartMath'

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

function pickMarkerIndexByX(table: MarkerTable, x: number): number {
  'worklet'
  const count = table.xs.length
  if (count === 0) return -1
  let lo = 0
  let hi = count - 1
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (table.xs[mid] < x) lo = mid + 1
    else hi = mid
  }
  if (lo === 0) return 0
  const prev = lo - 1
  return Math.abs(table.xs[prev] - x) <= Math.abs(table.xs[lo] - x) ? prev : lo
}

/**
 * Pan runs as a worklet: x → marker index → shared scrub time, no JS in the touch
 * path. JS is only poked at drag start/end, plus per-frame-change when a consumer
 * explicitly asked for onScrubTimeChange (history map seek, throttled by callee).
 */
function createScrubGesture({
  enabled,
  markerTableSV,
  activeScrubTimeMs,
  hasScrubCallback,
  startDrag,
  notifyScrub,
  endDrag,
}: {
  enabled: boolean
  markerTableSV: SharedValue<MarkerTable>
  activeScrubTimeMs: SharedValue<number | null>
  hasScrubCallback: boolean
  startDrag: () => void
  notifyScrub: (timeMs: number) => void
  endDrag: (timeMs: number | null) => void
}) {
  return Gesture.Pan()
    .enabled(enabled)
    .onBegin((event) => {
      'worklet'
      const idx = pickMarkerIndexByX(markerTableSV.value, event.x)
      if (idx < 0) return
      const timeMs = markerTableSV.value.ts[idx]
      activeScrubTimeMs.value = timeMs
      runOnJS(startDrag)()
      if (hasScrubCallback) runOnJS(notifyScrub)(timeMs)
    })
    .onUpdate((event) => {
      'worklet'
      const idx = pickMarkerIndexByX(markerTableSV.value, event.x)
      if (idx < 0) return
      const timeMs = markerTableSV.value.ts[idx]
      if (timeMs === activeScrubTimeMs.value) return
      activeScrubTimeMs.value = timeMs
      if (hasScrubCallback) runOnJS(notifyScrub)(timeMs)
    })
    .onFinalize(() => {
      'worklet'
      const timeMs = activeScrubTimeMs.value
      activeScrubTimeMs.value = null
      runOnJS(endDrag)(timeMs)
    })
}

/**
 * Range-trim pan: one gesture over the whole graph. onBegin grabs whichever handle is nearer the
 * touch; onUpdate drags it in free milliseconds, clamped to the domain and unable to cross its peer.
 * The handle tracks the finger on the UI thread; JS is poked (throttled) only to drive the preview.
 * Module-level so the shared-value writes live outside the component's render closure.
 */
function createTrimGesture({
  enabled,
  chartWidth,
  domainStartMs,
  domainEndMs,
  trimStartMs,
  trimEndMs,
  activeHandle,
  notifyTrim,
  commitTrim,
}: {
  enabled: boolean
  chartWidth: number
  domainStartMs: number
  domainEndMs: number
  trimStartMs: SharedValue<number>
  trimEndMs: SharedValue<number>
  activeHandle: SharedValue<0 | 1 | null>
  notifyTrim: (startMs: number, endMs: number) => void
  commitTrim: (startMs: number, endMs: number) => void
}) {
  const span = domainEndMs - domainStartMs
  return Gesture.Pan()
    .enabled(enabled)
    .onBegin((event) => {
      'worklet'
      const xStart = (chartWidth * (trimStartMs.value - domainStartMs)) / span
      const xEnd = (chartWidth * (trimEndMs.value - domainStartMs)) / span
      activeHandle.value = Math.abs(event.x - xStart) <= Math.abs(event.x - xEnd) ? 0 : 1
    })
    .onUpdate((event) => {
      'worklet'
      const clampedX = Math.max(0, Math.min(chartWidth, event.x))
      let ms = domainStartMs + (clampedX / chartWidth) * span
      if (activeHandle.value === 0) {
        if (ms > trimEndMs.value) ms = trimEndMs.value
        trimStartMs.value = ms
      } else if (activeHandle.value === 1) {
        if (ms < trimStartMs.value) ms = trimStartMs.value
        trimEndMs.value = ms
      }
      runOnJS(notifyTrim)(trimStartMs.value, trimEndMs.value)
    })
    .onFinalize(() => {
      'worklet'
      activeHandle.value = null
      runOnJS(commitTrim)(trimStartMs.value, trimEndMs.value)
    })
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

export interface SecondaryChartSeries {
  points: TelemetryChartPoint[]
  range: { y: { min: number; max: number } }
  color: string
  /** Display value for the current/selected time, shown in the header. */
  value: string
  formatValue?: (value: number) => string
}

/**
 * Turns the chart into a range trimmer: two draggable handles over the timeline, the region outside
 * them dimmed. `startMs`/`endMs` seed the handles (re-seeded when either changes). Handles are
 * clamped to the chart's own time domain and cannot cross — free milliseconds, no snapping, no
 * minimum span. `onChange` fires per drag frame (throttled by the chart); `onCommit` fires on
 * release. Both report the raw span so consumers can drive a live map/stats preview.
 */
export interface ChartTrimConfig {
  startMs: number
  endMs: number
  onChange: (startMs: number, endMs: number) => void
  onCommit: (startMs: number, endMs: number) => void
}

// Trim handle position is pushed to JS at most this often; the handle itself tracks the finger on
// the UI thread, so this only paces the map/stats preview, mirroring the scrub-seek throttle.
const TRIM_NOTIFY_THROTTLE_MS = 50

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
  /** Enable scrub gestures even without selection callbacks (live charts). */
  scrubbable?: boolean
  /** Reserve the right-axis gutter so charts with and without a secondary axis align. */
  reserveRightAxis?: boolean
  /** When set, the chart is a range trimmer instead of a scrubber. */
  trim?: ChartTrimConfig
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
  scrubbable = false,
  reserveRightAxis = false,
  trim,
}: TelemetryLineChartProps) {
  'use no memo'
  const [chartWidth, setChartWidth] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const internalScrubTimeMs = useSharedValue<number | null>(null)
  const activeScrubTimeMs = scrubTimeMs ?? internalScrubTimeMs
  const currentTimeMs = useSharedValue<number | null>(currentPoint?.date.getTime() ?? null)
  const onPointSelectedRef = useRef(onPointSelected)
  const onGestureStartRef = useRef(onGestureStart)
  const onScrubTimeChangeRef = useRef(onScrubTimeChange)
  const trimOnChangeRef = useRef(trim?.onChange)
  const trimOnCommitRef = useRef(trim?.onCommit)
  const lastTrimNotifyAtRef = useRef(0)
  const trimStartMs = useSharedValue(trim?.startMs ?? 0)
  const trimEndMs = useSharedValue(trim?.endMs ?? 0)
  const activeTrimHandle = useSharedValue<0 | 1 | null>(null)
  // Live charts keep streaming while the user scrubs; rebuilding paths and the marker
  // table mid-gesture starves the JS thread. Freeze the series for the drag instead.
  const liveSeriesRef = useRef({ points, secondary })
  const [frozenSeries, setFrozenSeries] = useState<{
    points: TelemetryChartPoint[]
    secondary?: SecondaryChartSeries
  } | null>(null)
  const displayPoints = frozenSeries?.points ?? points
  const displaySecondary = frozenSeries ? frozenSeries.secondary : secondary

  useEffect(() => {
    onPointSelectedRef.current = onPointSelected
    onGestureStartRef.current = onGestureStart
    onScrubTimeChangeRef.current = onScrubTimeChange
    trimOnChangeRef.current = trim?.onChange
    trimOnCommitRef.current = trim?.onCommit
    liveSeriesRef.current = { points, secondary }
  })

  // Re-seed the handles whenever a new trim session opens (start/end change identity).
  useEffect(() => {
    if (!trim) return
    setSharedValue(trimStartMs, trim.startMs)
    setSharedValue(trimEndMs, trim.endMs)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs
  }, [trim?.startMs, trim?.endMs])

  useEffect(() => {
    setSharedValue(currentTimeMs, currentPoint?.date.getTime() ?? null)
  }, [currentPoint, currentTimeMs])

  const onGraphLayout = useCallback((event: LayoutChangeEvent) => {
    setChartWidth(Math.round(event.nativeEvent.layout.width))
  }, [])

  const markerTable = useMemo(
    () =>
      buildMarkerTable({
        points: displayPoints,
        range,
        width: chartWidth,
        height,
        color,
        getPointColor,
        formatValue,
        windowMs,
        secondary: displaySecondary,
      }),
    [
      chartWidth,
      color,
      displayPoints,
      displaySecondary,
      formatValue,
      getPointColor,
      height,
      range,
      windowMs,
    ],
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
  // Only the string is captured: closing over `secondary` would drag its points
  // (and their Date fields) into the worklet, which Reanimated cannot copy.
  const secondaryFallbackValue = secondary?.value ?? '-'
  const liveSecondaryValueText = useDerivedValue(() => {
    const idx = liveIdx.value
    const values = markerTableSV.value.secondaryValueStrs
    return idx >= 0 && values ? values[idx] : secondaryFallbackValue
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
  const liveValueColorStyle = useAnimatedStyle(() => ({
    color: markerColor.value,
  }))

  // JS-side gesture bookkeeping: one call at drag start (tooltip + freeze) and one at
  // release. The per-move path stays entirely on the UI thread.
  const startDrag = useCallback(() => {
    setIsDragging(true)
    setFrozenSeries(liveSeriesRef.current)
    onGestureStartRef.current?.()
  }, [])
  const notifyScrub = useCallback((timeMs: number) => {
    onScrubTimeChangeRef.current?.(timeMs)
  }, [])
  const endDrag = useCallback((timeMs: number | null) => {
    setIsDragging(false)
    setFrozenSeries(null)
    if (timeMs != null && onPointSelectedRef.current) {
      const point = valueAtTime(liveSeriesRef.current.points, timeMs)
      if (point) onPointSelectedRef.current(point)
    }
  }, [])

  const scrubEnabled =
    !trim &&
    points.length > 0 &&
    chartWidth > 0 &&
    (scrubbable || !!onPointSelected || !!onScrubTimeChange)

  const hasScrubCallback = !!onScrubTimeChange
  const panGesture = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- shared values are only read/written inside gesture worklets, not during render
      createScrubGesture({
        enabled: scrubEnabled,
        markerTableSV,
        activeScrubTimeMs,
        hasScrubCallback,
        startDrag,
        notifyScrub,
        endDrag,
      }),
    [
      activeScrubTimeMs,
      endDrag,
      hasScrubCallback,
      markerTableSV,
      notifyScrub,
      scrubEnabled,
      startDrag,
    ],
  )

  // Trim shares the chart's own time domain: first→last plotted sample maps to [0, chartWidth].
  const trimDomainStartMs = displayPoints[0]?.date.getTime() ?? 0
  const trimDomainEndMs = displayPoints.at(-1)?.date.getTime() ?? 0
  const trimEnabled = !!trim && chartWidth > 0 && trimDomainEndMs > trimDomainStartMs

  const notifyTrim = useCallback((start: number, end: number) => {
    const now = Date.now()
    if (now - lastTrimNotifyAtRef.current < TRIM_NOTIFY_THROTTLE_MS) return
    lastTrimNotifyAtRef.current = now
    trimOnChangeRef.current?.(start, end)
  }, [])
  const commitTrim = useCallback((start: number, end: number) => {
    lastTrimNotifyAtRef.current = 0
    trimOnCommitRef.current?.(start, end)
  }, [])

  const trimGesture = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- shared values are only touched inside worklets
      createTrimGesture({
        enabled: trimEnabled,
        chartWidth,
        domainStartMs: trimDomainStartMs,
        domainEndMs: trimDomainEndMs,
        trimStartMs,
        trimEndMs,
        activeHandle: activeTrimHandle,
        notifyTrim,
        commitTrim,
      }),
    [
      activeTrimHandle,
      chartWidth,
      commitTrim,
      notifyTrim,
      trimDomainEndMs,
      trimDomainStartMs,
      trimEnabled,
      trimEndMs,
      trimStartMs,
    ],
  )

  const trimStartXStyle = useAnimatedStyle(() => {
    const span = trimDomainEndMs - trimDomainStartMs
    const x = span > 0 ? (chartWidth * (trimStartMs.value - trimDomainStartMs)) / span : 0
    return { transform: [{ translateX: Math.max(0, Math.min(chartWidth, x)) }] }
  })
  const trimEndXStyle = useAnimatedStyle(() => {
    const span = trimDomainEndMs - trimDomainStartMs
    const x = span > 0 ? (chartWidth * (trimEndMs.value - trimDomainStartMs)) / span : 0
    return { transform: [{ translateX: Math.max(0, Math.min(chartWidth, x)) }] }
  })
  const trimDimLeftStyle = useAnimatedStyle(() => {
    const span = trimDomainEndMs - trimDomainStartMs
    const x = span > 0 ? (chartWidth * (trimStartMs.value - trimDomainStartMs)) / span : 0
    return { width: Math.max(0, Math.min(chartWidth, x)) }
  })
  const trimDimRightStyle = useAnimatedStyle(() => {
    const span = trimDomainEndMs - trimDomainStartMs
    const x = span > 0 ? (chartWidth * (trimEndMs.value - trimDomainStartMs)) / span : chartWidth
    return { width: Math.max(0, chartWidth - Math.max(0, Math.min(chartWidth, x))) }
  })

  const activeGesture = trim ? trimGesture : panGesture

  const yMid = (range.y.min + range.y.max) / 2
  const secondaryYMid = secondary ? (secondary.range.y.min + secondary.range.y.max) / 2 : 0

  const timeLabels = useMemo(() => {
    const points = displayPoints
    if (points.length < 2) return null
    const now = points[points.length - 1].date
    const start = windowMs ? new Date(now.getTime() - windowMs) : points[0].date
    return {
      start: formatRelativeTime(start, now),
      end: 'now',
    }
  }, [displayPoints, windowMs])

  const activeColor = resolveActiveChartColor(currentPoint, color, getPointColor)
  const valueColorStyle = getPointColor && currentPoint ? { color: activeColor } : undefined
  const hasMarker = markerTable.ts.length > 0

  return (
    <View style={[styles.card, containerStyle]}>
      <View style={styles.header}>
        {label ? <Text style={styles.label}>{label}</Text> : <View />}
        <View style={styles.headerRight}>
          {isDragging && <AnimatedValueText text={liveTimeText} style={styles.headerTime} />}
          <AnimatedValueText
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
            <AnimatedValueText
              text={liveValueText}
              style={[styles.tooltipValue, { color: activeColor }, liveValueColorStyle]}
            />
            {secondary && (
              <AnimatedValueText
                text={liveSecondaryValueText}
                style={[styles.tooltipValue, { color: secondary.color }]}
              />
            )}
          </View>
          <AnimatedValueText text={liveTimeText} style={styles.tooltipTime} />
        </Animated.View>
      )}

      <View style={styles.chartBody}>
        <View style={[styles.yAxis, { height }]}>
          <Text style={styles.yLabel}>{formatAxisNumber(range.y.max)}</Text>
          <Text style={styles.yLabel}>{formatAxisNumber(yMid)}</Text>
          <Text style={styles.yLabel}>{formatAxisNumber(range.y.min)}</Text>
        </View>

        <GestureDetector gesture={activeGesture}>
          <View style={[styles.graphWrap, { height }]} onLayout={onGraphLayout}>
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
                  const x1 = getXPosition(displayPoints, range.startMs, chartWidth, windowMs)
                  const x2 = getXPosition(displayPoints, range.endMs, chartWidth, windowMs)
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

                {displaySecondary && (
                  <ChartLineSegments
                    points={displaySecondary.points}
                    range={displaySecondary.range}
                    width={chartWidth}
                    height={height}
                    color={displaySecondary.color}
                    windowMs={windowMs}
                  />
                )}

                <ChartLineSegments
                  points={displayPoints}
                  range={range}
                  width={chartWidth}
                  height={height}
                  color={color}
                  getPointColor={getPointColor}
                  windowMs={windowMs}
                />
              </Canvas>
            )}
            {chartWidth > 0 && hasMarker && !trim && (
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
            {trim && chartWidth > 0 && (
              <View style={[styles.trimOverlay, { height }]} pointerEvents="none">
                <Animated.View style={[styles.trimDim, styles.trimDimLeft, trimDimLeftStyle]} />
                <Animated.View style={[styles.trimDim, styles.trimDimRight, trimDimRightStyle]} />
                <Animated.View style={[styles.trimHandle, trimStartXStyle]}>
                  <View style={styles.trimHandleKnob} />
                </Animated.View>
                <Animated.View style={[styles.trimHandle, trimEndXStyle]}>
                  <View style={styles.trimHandleKnob} />
                </Animated.View>
              </View>
            )}
          </View>
        </GestureDetector>

        {secondary ? (
          <View style={[styles.rightAxis, { height }]}>
            <Text style={styles.yLabel}>{formatAxisNumber(secondary.range.y.max)}</Text>
            <Text style={styles.yLabel}>{formatAxisNumber(secondaryYMid)}</Text>
            <Text style={styles.yLabel}>{formatAxisNumber(secondary.range.y.min)}</Text>
          </View>
        ) : reserveRightAxis ? (
          <View style={[styles.rightAxis, { height }]} />
        ) : null}
      </View>

      <View
        style={[
          styles.xAxis,
          {
            marginLeft: Y_AXIS_WIDTH,
            marginRight: secondary || reserveRightAxis ? Y_AXIS_WIDTH : 0,
          },
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
  trimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  trimDim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.6),
  },
  trimDimLeft: {
    left: 0,
  },
  trimDimRight: {
    right: 0,
  },
  trimHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.amber.color,
  },
  trimHandleKnob: {
    width: 12,
    height: 20,
    borderRadius: 6,
    backgroundColor: theme.palette.amber.color,
    borderWidth: 1,
    borderColor: theme.palette.slate.surfaceDeep,
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
