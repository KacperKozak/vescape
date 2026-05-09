import { useCallback, useMemo, useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import Svg, {
  Circle as SvgCircle,
  Line as SvgLine,
  Polyline as SvgPolyline,
} from 'react-native-svg'

import { findNearestChartPointAtX, getChartPosition, type TelemetryChartPoint } from './chartMath'

const DEFAULT_HEIGHT = 54
const Y_AXIS_WIDTH = 34
const TOOLTIP_WIDTH = 94

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
}

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
}: TelemetryLineChartProps) {
  const [chartWidth, setChartWidth] = useState(0)
  const [chartPageX, setChartPageX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const graphRef = useRef<View>(null)

  const onGraphLayout = useCallback((event: LayoutChangeEvent) => {
    setChartWidth(Math.round(event.nativeEvent.layout.width))
    graphRef.current?.measure((_x, _y, _width, _height, pageX) => {
      setChartPageX(pageX)
    })
  }, [])

  const markerPosition = useMemo(() => {
    if (!currentPoint || chartWidth < 1) return null
    return getChartPosition(points, currentPoint, range, chartWidth, height)
  }, [chartWidth, currentPoint, height, points, range])

  const polylinePoints = useMemo(
    () =>
      chartWidth > 0
        ? points
            .map((point) => getChartPosition(points, point, range, chartWidth, height))
            .filter((point): point is { x: number; y: number } => point != null)
            .map((point) => `${point.x},${point.y}`)
            .join(' ')
        : '',
    [chartWidth, height, points, range],
  )

  const selectAtPageX = useCallback(
    (x: number) => {
      if (!onPointSelected) return
      const point = findNearestChartPointAtX(points, x - chartPageX, chartWidth)
      if (!point) return
      onPointSelected(point)
    },
    [chartPageX, chartWidth, onPointSelected, points],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () =>
          !!onPointSelected && points.length > 0 && chartWidth > 0,
        onMoveShouldSetPanResponder: () => !!onPointSelected && points.length > 0 && chartWidth > 0,
        onPanResponderGrant: (_event, gesture) => {
          setIsDragging(true)
          onGestureStart?.()
          selectAtPageX(gesture.x0)
        },
        onPanResponderMove: (_event, gesture) => {
          selectAtPageX(gesture.moveX)
        },
        onPanResponderRelease: () => setIsDragging(false),
        onPanResponderTerminate: () => setIsDragging(false),
      }),
    [chartWidth, onGestureStart, onPointSelected, points.length, selectAtPageX],
  )

  const yMid = (range.y.min + range.y.max) / 2

  const timeLabels = useMemo(() => {
    if (points.length < 2) return null
    const now = points[points.length - 1].date
    return {
      start: formatRelativeTime(points[0].date, now),
      end: 'now',
    }
  }, [points])

  const tooltipLeft = useMemo(() => {
    if (!markerPosition || chartWidth <= 0) return 0
    const half = TOOLTIP_WIDTH / 2
    let left = markerPosition.x - half
    if (left < 0) left = 0
    if (left + TOOLTIP_WIDTH > chartWidth) left = chartWidth - TOOLTIP_WIDTH
    return left
  }, [chartWidth, markerPosition])

  return (
    <View style={[styles.card, containerStyle]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.headerRight}>
          {isDragging && currentPoint && (
            <Text style={styles.headerTime}>{formatTime(currentPoint.date)}</Text>
          )}
          <Text style={[styles.value, isDragging && { color }]}>{value}</Text>
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
            <SvgLine x1={0} y1={0.5} x2={chartWidth} y2={0.5} stroke="#1e293b" strokeWidth={0.5} />
            <SvgLine
              x1={0}
              y1={height / 2}
              x2={chartWidth}
              y2={height / 2}
              stroke="#1e293b"
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
            <SvgLine
              x1={0}
              y1={height - 0.5}
              x2={chartWidth}
              y2={height - 0.5}
              stroke="#1e293b"
              strokeWidth={0.5}
            />

            <SvgPolyline
              points={polylinePoints}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {markerPosition && isDragging && (
              <SvgLine
                x1={markerPosition.x}
                y1={0}
                x2={markerPosition.x}
                y2={height}
                stroke="#475569"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            )}

            {markerPosition && (
              <SvgCircle
                cx={markerPosition.x}
                cy={markerPosition.y}
                r={isDragging ? 6 : 4}
                fill="#0f172a"
                stroke={color}
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

      {timeLabels && (
        <View style={[styles.xAxis, { marginLeft: Y_AXIS_WIDTH }]}>
          <Text style={styles.xLabel}>{timeLabels.start}</Text>
          <Text style={styles.xLabel}>{timeLabels.end}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#111827',
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
    color: '#64748b',
    fontSize: 9,
    fontVariant: ['tabular-nums'],
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  value: {
    color: '#e2e8f0',
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
    color: '#475569',
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
    color: '#475569',
    fontSize: 8,
    fontVariant: ['tabular-nums'],
  },
  tooltip: {
    position: 'absolute',
    top: 4,
    width: TOOLTIP_WIDTH,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 6,
    paddingVertical: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tooltipValue: {
    color: '#e2e8f0',
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tooltipTime: {
    color: '#64748b',
    fontSize: 8,
    fontVariant: ['tabular-nums'],
  },
})
