import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Platform, StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { formatTuneValue } from '@/tune/fields'
import { snapValue } from '@/tune/sliderDefinitions'
import {
  DETENT_CAPTURE_VELOCITY,
  DETENT_DECAY_PER_FRAME,
  DETENT_PULL,
  DRAG_RANGE_GAIN,
  LOCK_VELOCITY,
  MAX_THROW_VELOCITY,
  MOMENTUM_CARRY,
  THROW_DISTANCE_GAIN,
  THROW_EASE_POWER,
  computeDetentStrength,
  computeHapticStepSpacing,
  computeMomentumEmitStepIndex,
  computeRangeScale,
  computeThrowDurationMs,
  computeTuneDialLayout,
  resolveThrowGestureVelocity,
  smoothThrowGestureVelocity,
  shouldPlayTuneDialHaptic,
} from '@/components/tune/tuneDialPhysics'

const DIAL_HEIGHT = 56
const INDICATOR_COLOR = '#ef4444'
const PREV_MARK_COLOR = '#facc15'
const MAJOR_TICK_COLOR = '#94a3b8'
const MINOR_TICK_COLOR = '#334155'
const LABEL_COLOR = '#64748b'

const SNAP_SPRING = { damping: 18, stiffness: 700, mass: 0.8 }

interface TuneDialProps {
  value: number
  previousValue?: number
  min: number
  max: number
  step: number
  onValueChange: (value: number) => void
}

export function TuneDial({ value, previousValue, min, max, step, onValueChange }: TuneDialProps) {
  const range = max - min
  const {
    totalSteps,
    totalWidth,
    stepPx,
    majorEvery,
    minorEvery,
    renderMinor,
    labelEveryStep,
    renderMidpointTicks,
  } = useMemo(() => computeTuneDialLayout(min, max, step), [min, max, step])
  const hapticStepSpacing = computeHapticStepSpacing({ labelEveryStep, majorEvery })
  const rangeScale = computeRangeScale(totalWidth)
  const lastEmittedValue = useRef(value)
  const lastStepIndex = useRef(Math.round((value - min) / step))
  const recentInternalValues = useRef(new Set<number>())

  const valueToOffset = useCallback(
    (v: number) => ((v - min) / range) * totalWidth,
    [min, range, totalWidth],
  )

  const translateX = useSharedValue(-valueToOffset(value))
  const dragStartX = useSharedValue(0)
  const isDragging = useSharedValue(false)
  const momentumVelocity = useSharedValue(0)
  const throwDurationMs = useSharedValue(0)
  const throwElapsedMs = useSharedValue(0)
  const smoothedThrowGestureVelocityX = useSharedValue(0)
  const latestGestureTranslationX = useSharedValue(0)
  const previousFrameGestureTranslationX = useSharedValue(0)
  const stationaryGestureMs = useSharedValue(0)

  const tick = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else if (Platform.OS === 'android') {
      void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)
    }
  }, [])

  const rememberInternalValue = useCallback((nextValue: number) => {
    recentInternalValues.current.add(nextValue)
    if (recentInternalValues.current.size <= 80) return

    const oldestValue = recentInternalValues.current.values().next().value
    if (oldestValue != null) {
      recentInternalValues.current.delete(oldestValue)
    }
  }, [])

  const emitStepIndex = useCallback(
    (rawStepIndex: number, shouldTick = true) => {
      const stepIndex = Math.max(0, Math.min(totalSteps, rawStepIndex))
      const snapped = snapValue(min + stepIndex * step, min, max, step)
      const previousStepIndex = lastStepIndex.current
      lastStepIndex.current = stepIndex
      if (snapped !== lastEmittedValue.current) {
        lastEmittedValue.current = snapped
        rememberInternalValue(snapped)
        onValueChange(snapped)
        if (
          shouldTick &&
          shouldPlayTuneDialHaptic(previousStepIndex, stepIndex, hapticStepSpacing)
        ) {
          tick()
        }
      }
      return snapped
    },
    [hapticStepSpacing, min, max, step, totalSteps, onValueChange, rememberInternalValue, tick],
  )

  const snapOffsetToNearest = useCallback(
    (rawOffset: number) => {
      const stepIndex = Math.max(0, Math.min(totalSteps, Math.round(-rawOffset / stepPx)))
      emitStepIndex(stepIndex)
      translateX.value = withSpring(-stepIndex * stepPx, SNAP_SPRING)
    },
    [emitStepIndex, stepPx, totalSteps, translateX],
  )

  useFrameCallback((frame) => {
    const rawDt = frame.timeSincePreviousFrame ?? 16

    if (isDragging.value) {
      const translationDelta = Math.abs(
        latestGestureTranslationX.value - previousFrameGestureTranslationX.value,
      )
      stationaryGestureMs.value = translationDelta < 0.35 ? stationaryGestureMs.value + rawDt : 0
      previousFrameGestureTranslationX.value = latestGestureTranslationX.value
      return
    }

    const dt = Math.min(rawDt, 34) / 1000
    const durationMs = throwDurationMs.value
    const previousProgress = durationMs > 0 ? Math.min(1, throwElapsedMs.value / durationMs) : 1
    throwElapsedMs.value = durationMs > 0 ? Math.min(durationMs, throwElapsedMs.value + rawDt) : 0
    const progress = durationMs > 0 ? Math.min(1, throwElapsedMs.value / durationMs) : 1
    const remainingRatio =
      previousProgress >= 1 ? 0 : (1 - progress) / Math.max(0.001, 1 - previousProgress)
    momentumVelocity.value *= Math.pow(Math.max(0, remainingRatio), THROW_EASE_POWER)

    const speed = Math.abs(momentumVelocity.value)

    if (speed <= LOCK_VELOCITY) {
      if (speed > 0) {
        momentumVelocity.value = 0
        throwDurationMs.value = 0
        throwElapsedMs.value = 0
        const stepIndex = Math.max(0, Math.min(totalSteps, Math.round(-translateX.value / stepPx)))
        translateX.value = withSpring(-stepIndex * stepPx, SNAP_SPRING)
        scheduleOnRN(emitStepIndex, stepIndex)
      }
      return
    }

    let nextOffset = translateX.value + momentumVelocity.value * dt
    if (nextOffset > 0 || nextOffset < -totalWidth) {
      nextOffset = Math.max(-totalWidth, Math.min(0, nextOffset))
      momentumVelocity.value = 0
      throwDurationMs.value = 0
      throwElapsedMs.value = 0
      const edgeStepIndex = Math.max(0, Math.min(totalSteps, Math.round(-nextOffset / stepPx)))
      translateX.value = withSpring(-edgeStepIndex * stepPx, SNAP_SPRING)
      scheduleOnRN(emitStepIndex, edgeStepIndex)
      return
    }

    const nearestStepIndex = Math.max(0, Math.min(totalSteps, Math.round(-nextOffset / stepPx)))
    const nearestStepOffset = -nearestStepIndex * stepPx
    const detentRadius = Math.max(1.5, Math.min(stepPx * 0.34, 18))
    const detentStrength = computeDetentStrength(totalSteps)
    const detentPull = DETENT_PULL * detentStrength
    const detentDecayPerFrame = 1 - (1 - DETENT_DECAY_PER_FRAME) * detentStrength
    const detentCaptureVelocity = DETENT_CAPTURE_VELOCITY * detentStrength
    const detentDistance = nextOffset - nearestStepOffset

    if (
      Math.abs(detentDistance) <= detentRadius &&
      Math.abs(momentumVelocity.value) <= detentCaptureVelocity
    ) {
      momentumVelocity.value =
        (momentumVelocity.value - detentDistance * detentPull * dt) *
        Math.pow(detentDecayPerFrame, dt * 60)
    }

    translateX.value = nextOffset
    const emittedStepIndex = computeMomentumEmitStepIndex(nearestStepIndex, totalSteps)
    scheduleOnRN(emitStepIndex, emittedStepIndex, true)
  })

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-15, 15])
        .onStart(() => {
          cancelAnimation(translateX)
          isDragging.value = true
          throwDurationMs.value = 0
          throwElapsedMs.value = 0
          smoothedThrowGestureVelocityX.value = 0
          latestGestureTranslationX.value = 0
          previousFrameGestureTranslationX.value = 0
          stationaryGestureMs.value = 0
          dragStartX.value = translateX.value
          lastStepIndex.current = Math.round((value - min) / step)
        })
        .onUpdate((e) => {
          const raw = dragStartX.value + e.translationX * rangeScale * DRAG_RANGE_GAIN
          const clamped = Math.max(-totalWidth, Math.min(0, raw))
          translateX.value = clamped
          latestGestureTranslationX.value = e.translationX
          smoothedThrowGestureVelocityX.value = smoothThrowGestureVelocity(
            smoothedThrowGestureVelocityX.value,
            e.velocityX,
          )
          const stepIndex = Math.max(0, Math.min(totalSteps, Math.round(-clamped / stepPx)))
          scheduleOnRN(emitStepIndex, stepIndex)
        })
        .onEnd((e) => {
          isDragging.value = false
          const gestureVelocityX = resolveThrowGestureVelocity(
            e.velocityX,
            smoothedThrowGestureVelocityX.value,
            e.translationX,
            stationaryGestureMs.value,
          )
          const normalizedVelocity = gestureVelocityX * THROW_DISTANCE_GAIN * rangeScale
          const maxVelocity = MAX_THROW_VELOCITY * Math.max(0.2, rangeScale)
          const v = Math.max(-maxVelocity, Math.min(maxVelocity, normalizedVelocity))
          momentumVelocity.value = Math.max(
            -maxVelocity,
            Math.min(maxVelocity, momentumVelocity.value * MOMENTUM_CARRY + v),
          )
          throwDurationMs.value = computeThrowDurationMs(
            gestureVelocityX,
            momentumVelocity.value,
            totalWidth,
          )
          throwElapsedMs.value = 0
          if (Math.abs(momentumVelocity.value) <= LOCK_VELOCITY) {
            scheduleOnRN(snapOffsetToNearest, translateX.value)
          } else {
            const stepIndex = Math.max(
              0,
              Math.min(totalSteps, Math.round(-translateX.value / stepPx)),
            )
            scheduleOnRN(emitStepIndex, stepIndex)
          }
        }),
    [
      dragStartX,
      emitStepIndex,
      isDragging,
      latestGestureTranslationX,
      momentumVelocity,
      previousFrameGestureTranslationX,
      rangeScale,
      snapOffsetToNearest,
      smoothedThrowGestureVelocityX,
      stationaryGestureMs,
      stepPx,
      throwDurationMs,
      throwElapsedMs,
      totalSteps,
      totalWidth,
      translateX,
      min,
      step,
      value,
    ],
  )

  useEffect(() => {
    if (value === lastEmittedValue.current) {
      recentInternalValues.current.clear()
      return
    }

    if (recentInternalValues.current.has(value)) return

    const expectedOffset = -valueToOffset(value)
    if (Math.abs(translateX.value - expectedOffset) > stepPx * 0.3) {
      lastEmittedValue.current = value
      lastStepIndex.current = Math.round((value - min) / step)
      momentumVelocity.value = 0
      throwDurationMs.value = 0
      throwElapsedMs.value = 0
      translateX.value = withSpring(expectedOffset, SNAP_SPRING)
    }
  }, [
    min,
    momentumVelocity,
    step,
    throwDurationMs,
    throwElapsedMs,
    value,
    valueToOffset,
    translateX,
    stepPx,
  ])

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
      const isMajor = labelEveryStep || i % majorEvery === 0
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

      if (renderMidpointTicks && i < totalSteps) {
        elements.push(
          <View key={`${i}-mid`} style={[styles.midpointTick, { left: x + stepPx / 2 }]} />,
        )
      }
    }
    return elements
  }, [
    totalSteps,
    min,
    step,
    decimals,
    stepPx,
    majorEvery,
    minorEvery,
    renderMinor,
    labelEveryStep,
    renderMidpointTicks,
  ])

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
  midpointTick: {
    position: 'absolute',
    top: 15,
    width: 1,
    height: 7,
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
