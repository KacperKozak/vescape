import { useCallback, useMemo, useRef, useState } from 'react'
import { PanResponder, StyleSheet, Text, View } from 'react-native'
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native'
import Svg, { Circle as SvgCircle, Polyline as SvgPolyline } from 'react-native-svg'

import { findNearestChartPointAtX, getChartPosition, type TelemetryChartPoint } from './chartMath'

const DEFAULT_HEIGHT = 54

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
}: TelemetryLineChartProps) {
  const [chartWidth, setChartWidth] = useState(0)
  const [chartPageX, setChartPageX] = useState(0)
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
          onGestureStart?.()
          selectAtPageX(gesture.x0)
        },
        onPanResponderMove: (_event, gesture) => {
          selectAtPageX(gesture.moveX)
        },
      }),
    [chartWidth, onGestureStart, onPointSelected, points.length, selectAtPageX],
  )

  return (
    <View style={[styles.card, containerStyle]}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <View
        ref={graphRef}
        style={[styles.graphWrap, { height }]}
        onLayout={onGraphLayout}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height={height} style={styles.graph}>
          <SvgPolyline
            points={polylinePoints}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {markerPosition && (
            <SvgCircle
              cx={markerPosition.x}
              cy={markerPosition.y}
              r={4}
              fill="#0f172a"
              stroke={color}
              strokeWidth={2}
            />
          )}
        </Svg>
      </View>
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
  graph: {
    height: '100%',
  },
  graphWrap: {
    marginTop: 4,
  },
})
