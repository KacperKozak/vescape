import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withSpring,
} from 'react-native-reanimated'

import { snapValue } from '@/tune/sliderDefinitions'
import { formatTuneValue } from '@/tune/fields'

const DIAL_HEIGHT = 56
const TARGET_LABEL_PX = 70
const MIN_STEP_PX = 2
const INDICATOR_COLOR = '#ef4444'
const PREV_MARK_COLOR = '#facc15'
const MAJOR_TICK_COLOR = '#94a3b8'
const MINOR_TICK_COLOR = '#334155'
const LABEL_COLOR = '#64748b'

const SNAP_SPRING = { damping: 18, stiffness: 600, mass: 0.4 }

interface TuneDialProps {
  value: number
  previousValue?: number
  min: number
  max: number
  step: number
  onValueChange: (value: number) => void
}

function niceMajorValue(range: number): number {
  if (range <= 1) return 0.1
  if (range <= 2) return 0.5
  if (range <= 5) return 1
  if (range <= 15) return 1
  if (range <= 30) return 5
  if (range <= 100) return 10
  return 50
}

function computeLayout(min: number, max: number, step: number) {
  const range = max - min
  const totalSteps = Math.round(range / step)

  const majorVal = niceMajorValue(range)
  const majorEvery = Math.max(1, Math.round(majorVal / step))
  const rawStepPx = TARGET_LABEL_PX / majorEvery
  const stepPx = Math.max(MIN_STEP_PX, rawStepPx)
  const totalWidth = totalSteps * stepPx

  const minorEvery = Math.max(1, Math.round(majorEvery / 5))
  const minMinorPx = 6
  const renderMinor = minorEvery * stepPx >= minMinorPx

  return { totalSteps, totalWidth, stepPx, majorEvery, minorEvery, renderMinor }
}

export function TuneDial({ value, previousValue, min, max, step, onValueChange }: TuneDialProps) {
  const range = max - min
  const { totalSteps, totalWidth, stepPx, majorEvery, minorEvery, renderMinor } = useMemo(
    () => computeLayout(min, max, step),
    [min, max, step],
  )
  const lastEmittedValue = useRef(value)

  const valueToOffset = useCallback(
    (v: number) => ((v - min) / range) * totalWidth,
    [min, range, totalWidth],
  )

  const translateX = useSharedValue(-valueToOffset(value))
  const dragStartX = useSharedValue(0)

  const tick = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync()
    }
  }, [])

  const emitSnapped = useCallback(
    (rawOffset: number) => {
      const rawVal = min + (-rawOffset / totalWidth) * range
      const snapped = snapValue(rawVal, min, max, step)
      if (snapped !== lastEmittedValue.current) {
        lastEmittedValue.current = snapped
        onValueChange(snapped)
        tick()
      }
      return -valueToOffset(snapped)
    },
    [min, max, step, range, totalWidth, valueToOffset, onValueChange, tick],
  )

  const snapToNearest = useCallback(
    (rawOffset: number) => {
      const snappedOffset = emitSnapped(rawOffset)
      translateX.value = withSpring(snappedOffset, SNAP_SPRING)
    },
    [emitSnapped, translateX],
  )

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-15, 15])
        .onStart(() => {
          cancelAnimation(translateX)
          dragStartX.value = translateX.value
        })
        .onUpdate((e) => {
          const raw = dragStartX.value + e.translationX
          const clamped = Math.max(-totalWidth, Math.min(0, raw))
          const snapped = Math.round(clamped / stepPx) * stepPx
          const magnetism = 0.45
          const target = clamped * (1 - magnetism) + snapped * magnetism
          translateX.value = withSpring(target, {
            damping: 30,
            stiffness: 400,
            mass: 0.3,
          })
          runOnJS(emitSnapped)(snapped)
        })
        .onEnd((e) => {
          const v = Math.max(-3000, Math.min(3000, e.velocityX))
          if (Math.abs(v) > 200) {
            translateX.value = withDecay(
              {
                velocity: v,
                clamp: [-totalWidth, 0],
                deceleration: 0.992,
              },
              () => {
                runOnJS(snapToNearest)(translateX.value)
              },
            )
          } else {
            runOnJS(snapToNearest)(translateX.value)
          }
        }),
    [dragStartX, translateX, totalWidth, stepPx, snapToNearest, emitSnapped],
  )

  useEffect(() => {
    const expectedOffset = -valueToOffset(value)
    if (Math.abs(translateX.value - expectedOffset) > stepPx * 0.3) {
      lastEmittedValue.current = value
      translateX.value = withSpring(expectedOffset, SNAP_SPRING)
    }
  }, [value, valueToOffset, translateX, stepPx])

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const prevMarkOffset = previousValue != null ? valueToOffset(previousValue) : null
  const decimals = step < 1 ? Math.ceil(Math.abs(Math.log10(step))) : 0

  const ticks = useMemo(() => {
    const elements: React.ReactNode[] = []

    for (let i = 0; i <= totalSteps; i++) {
      const val = Number((min + i * step).toFixed(decimals))
      const x = i * stepPx
      const isMajor = i % majorEvery === 0
      const isMinor = !isMajor && renderMinor && i % minorEvery === 0

      if (isMajor) {
        elements.push(
          <View key={i} style={[styles.majorTick, { left: x }]}>
            <View style={styles.majorTickLine} />
            <Text style={styles.tickLabel}>{formatTuneValue(val)}</Text>
          </View>,
        )
      } else if (isMinor) {
        elements.push(<View key={i} style={[styles.minorTick, { left: x }]} />)
      }
    }
    return elements
  }, [totalSteps, min, step, decimals, stepPx, majorEvery, minorEvery, renderMinor])

  return (
    <GestureHandlerRootView style={styles.rootView}>
      <View style={styles.container}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={styles.gestureArea}>
            <Animated.View style={[styles.strip, { width: totalWidth + 1 }, stripStyle]}>
              {ticks}
              {prevMarkOffset != null && (
                <View style={[styles.prevMark, { left: prevMarkOffset }]} />
              )}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        <View style={styles.indicator} pointerEvents="none" />
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  rootView: {
    overflow: 'hidden',
    borderRadius: 12,
  },
  container: {
    height: DIAL_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  gestureArea: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: '50%',
  },
  strip: {
    height: DIAL_HEIGHT,
    position: 'relative',
  },
  majorTick: {
    position: 'absolute',
    top: 6,
    alignItems: 'center',
    width: 0,
  },
  majorTickLine: {
    width: 2,
    height: 20,
    backgroundColor: MAJOR_TICK_COLOR,
    borderRadius: 1,
  },
  tickLabel: {
    color: LABEL_COLOR,
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginTop: 3,
    width: 50,
    textAlign: 'center',
  },
  minorTick: {
    position: 'absolute',
    top: 12,
    width: 1,
    height: 10,
    backgroundColor: MINOR_TICK_COLOR,
    borderRadius: 0.5,
  },
  prevMark: {
    position: 'absolute',
    top: 0,
    width: 2,
    height: DIAL_HEIGHT,
    backgroundColor: PREV_MARK_COLOR,
    opacity: 0.5,
    borderRadius: 1,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: 2.5,
    marginLeft: -1.25,
    backgroundColor: INDICATOR_COLOR,
    borderRadius: 2,
    shadowColor: INDICATOR_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
})
