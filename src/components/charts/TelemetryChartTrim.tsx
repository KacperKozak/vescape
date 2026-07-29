import { useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'

import { theme } from '@/constants/theme'

export interface ChartTrimConfig {
  startMs: number
  endMs: number
  onChange: (startMs: number, endMs: number) => void
  onCommit: (startMs: number, endMs: number) => void
}

const TRIM_NOTIFY_THROTTLE_MS = 50

function setSharedValue<T>(shared: SharedValue<T>, value: T) {
  shared.value = value
}

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

interface UseChartTrimOptions {
  trim: ChartTrimConfig | undefined
  chartWidth: number
  domainStartMs: number
  domainEndMs: number
}

export function useChartTrim({
  trim,
  chartWidth,
  domainStartMs,
  domainEndMs,
}: UseChartTrimOptions) {
  const onChangeRef = useRef(trim?.onChange)
  const onCommitRef = useRef(trim?.onCommit)
  const lastNotifyAtRef = useRef(0)
  const startMs = useSharedValue(trim?.startMs ?? 0)
  const endMs = useSharedValue(trim?.endMs ?? 0)
  const activeHandle = useSharedValue<0 | 1 | null>(null)

  useEffect(() => {
    onChangeRef.current = trim?.onChange
    onCommitRef.current = trim?.onCommit
  })

  useEffect(() => {
    if (!trim) return
    setSharedValue(startMs, trim.startMs)
    setSharedValue(endMs, trim.endMs)
  }, [endMs, startMs, trim])

  const notifyTrim = useCallback((start: number, end: number) => {
    const now = Date.now()
    if (now - lastNotifyAtRef.current < TRIM_NOTIFY_THROTTLE_MS) return
    lastNotifyAtRef.current = now
    onChangeRef.current?.(start, end)
  }, [])
  const commitTrim = useCallback((start: number, end: number) => {
    lastNotifyAtRef.current = 0
    onCommitRef.current?.(start, end)
  }, [])
  const enabled = !!trim && chartWidth > 0 && domainEndMs > domainStartMs
  const gesture = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- shared values are only touched inside worklets
      createTrimGesture({
        enabled,
        chartWidth,
        domainStartMs,
        domainEndMs,
        trimStartMs: startMs,
        trimEndMs: endMs,
        activeHandle,
        notifyTrim,
        commitTrim,
      }),
    [
      activeHandle,
      chartWidth,
      commitTrim,
      domainEndMs,
      domainStartMs,
      enabled,
      endMs,
      notifyTrim,
      startMs,
    ],
  )
  const positionFor = (value: number) => {
    'worklet'
    const span = domainEndMs - domainStartMs
    const x = span > 0 ? (chartWidth * (value - domainStartMs)) / span : 0
    return Math.max(0, Math.min(chartWidth, x))
  }
  const startXStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: positionFor(startMs.value) }],
  }))
  const endXStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: positionFor(endMs.value) }],
  }))
  const dimLeftStyle = useAnimatedStyle(() => ({ width: positionFor(startMs.value) }))
  const dimRightStyle = useAnimatedStyle(() => ({
    width: chartWidth - positionFor(endMs.value),
  }))

  return { gesture, startXStyle, endXStyle, dimLeftStyle, dimRightStyle }
}

interface TelemetryChartTrimOverlayProps {
  height: number
  chartWidth: number
  trimState: ReturnType<typeof useChartTrim>
}

export function TelemetryChartTrimOverlay({
  height,
  chartWidth,
  trimState,
}: TelemetryChartTrimOverlayProps) {
  return (
    <View style={[styles.overlay, { height }]} pointerEvents="none">
      <Animated.View style={[styles.dim, styles.dimLeft, trimState.dimLeftStyle]} />
      <Animated.View style={[styles.dim, styles.dimRight, trimState.dimRightStyle]} />
      <Animated.View style={[styles.handle, trimState.startXStyle]}>
        <View style={styles.handleKnob} />
      </Animated.View>
      <Animated.View style={[styles.handle, trimState.endXStyle]}>
        <View style={styles.handleKnob} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  dim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.6),
  },
  dimLeft: {
    left: 0,
  },
  dimRight: {
    right: 0,
  },
  handle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.amber.color,
  },
  handleKnob: {
    width: 12,
    height: 20,
    borderRadius: 6,
    backgroundColor: theme.palette.amber.color,
    borderWidth: 1,
    borderColor: theme.palette.slate.surfaceDeep,
  },
})
