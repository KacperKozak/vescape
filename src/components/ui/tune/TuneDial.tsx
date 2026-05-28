/* eslint-disable react-hooks/immutability */
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useMemo } from 'react'
import {
  type LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { formatTuneValue } from '@/lib/tune/fields'
import { theme } from '@/constants/theme'
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
  computeRenderedWidthScale,
  computeThrowDurationMs,
  computeTuneDialLayout,
  resolveThrowGestureVelocity,
  smoothThrowGestureVelocity,
  shouldPlayTuneDialHaptic,
} from '@/components/ui/tune/tuneDialPhysics'

const DIAL_HEIGHT = 78
const VALUE_MARKER_SIZE = 26
const VALUE_MARKER_TOP = 35
const MARKER_LINE_WIDTH = 2.5
const INDICATOR_COLOR = theme.error.color
const PREV_MARK_COLOR = theme.highlight.color
const MAJOR_TICK_COLOR = theme.neutral.textSecondary
const MINOR_TICK_COLOR = theme.neutral.border
const LABEL_COLOR = theme.neutral.textMuted

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
  'use no memo'
  const { width: screenWidth } = useWindowDimensions()
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
  const initialStepIndex = Math.round((value - min) / step)

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
  const lastEmittedValue = useSharedValue(value)
  const lastStepIndex = useSharedValue(initialStepIndex)
  const lastEdgeHapticStepIndex = useSharedValue(-1)
  const renderedWidthScale = useSharedValue(1)
  const valueBadgeScale = useSharedValue(1)

  const tick = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else if (Platform.OS === 'android') {
      void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick)
    }
  }, [])

  const edgeTick = useCallback(() => {
    if (Platform.OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)
    } else if (Platform.OS === 'android') {
      void Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
    }
  }, [])

  const emitEdgeHaptic = useCallback(
    (stepIndex: number) => {
      'worklet'
      if (stepIndex !== 0 && stepIndex !== totalSteps) {
        lastEdgeHapticStepIndex.value = -1
        return
      }

      if (lastEdgeHapticStepIndex.value === stepIndex) return

      lastEdgeHapticStepIndex.value = stepIndex
      scheduleOnRN(edgeTick)
    },
    [edgeTick, lastEdgeHapticStepIndex, totalSteps],
  )

  const emitStepIndex = useCallback(
    (rawStepIndex: number, shouldTick = true) => {
      'worklet'
      const stepIndex = Math.max(0, Math.min(totalSteps, rawStepIndex))
      const snappedRaw = Math.round((min + stepIndex * step - min) / step) * step + min
      const decimals = step < 1 ? Math.ceil(Math.abs(Math.log10(step))) : 0
      const snapped = Number(Math.max(min, Math.min(max, snappedRaw)).toFixed(decimals))
      const previousStepIndex = lastStepIndex.value
      lastStepIndex.value = stepIndex
      if (stepIndex !== 0 && stepIndex !== totalSteps) {
        lastEdgeHapticStepIndex.value = -1
      }
      if (snapped !== lastEmittedValue.value) {
        lastEmittedValue.value = snapped
        scheduleOnRN(onValueChange, snapped)
        if (
          shouldTick &&
          shouldPlayTuneDialHaptic(previousStepIndex, stepIndex, hapticStepSpacing)
        ) {
          scheduleOnRN(tick)
        }
      }
      return snapped
    },
    [
      hapticStepSpacing,
      lastEdgeHapticStepIndex,
      lastEmittedValue,
      lastStepIndex,
      min,
      max,
      step,
      totalSteps,
      onValueChange,
      tick,
    ],
  )

  const snapOffsetToNearest = useCallback(
    (rawOffset: number) => {
      'worklet'
      const stepIndex = Math.max(0, Math.min(totalSteps, Math.round(-rawOffset / stepPx)))
      emitStepIndex(stepIndex)
      translateX.value = withSpring(-stepIndex * stepPx, SNAP_SPRING)
    },
    [emitStepIndex, stepPx, totalSteps, translateX],
  )

  const pauseThrow = useCallback(() => {
    'worklet'
    cancelAnimation(translateX)
    momentumVelocity.value = 0
    throwDurationMs.value = 0
    throwElapsedMs.value = 0
  }, [momentumVelocity, throwDurationMs, throwElapsedMs, translateX])

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      renderedWidthScale.value = computeRenderedWidthScale(
        event.nativeEvent.layout.width,
        screenWidth,
      )
    },
    [renderedWidthScale, screenWidth],
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
        emitStepIndex(stepIndex)
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
      emitStepIndex(edgeStepIndex)
      emitEdgeHaptic(edgeStepIndex)
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
    emitStepIndex(emittedStepIndex, true)
  })

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-8, 8])
        .failOffsetY([-15, 15])
        .onTouchesDown(() => {
          pauseThrow()
        })
        .onStart(() => {
          pauseThrow()
          isDragging.value = true
          smoothedThrowGestureVelocityX.value = 0
          latestGestureTranslationX.value = 0
          previousFrameGestureTranslationX.value = 0
          stationaryGestureMs.value = 0
          dragStartX.value = translateX.value
          lastStepIndex.value = Math.round((value - min) / step)
        })
        .onUpdate((e) => {
          const dragScale = rangeScale * renderedWidthScale.value
          const raw = dragStartX.value + e.translationX * dragScale * DRAG_RANGE_GAIN
          const clamped = Math.max(-totalWidth, Math.min(0, raw))
          translateX.value = clamped
          latestGestureTranslationX.value = e.translationX
          smoothedThrowGestureVelocityX.value = smoothThrowGestureVelocity(
            smoothedThrowGestureVelocityX.value,
            e.velocityX,
          )
          const stepIndex = Math.max(0, Math.min(totalSteps, Math.round(-clamped / stepPx)))
          emitStepIndex(stepIndex)
          if (raw > 0 || raw < -totalWidth) {
            emitEdgeHaptic(stepIndex)
          }
        })
        .onEnd((e) => {
          isDragging.value = false
          const gestureVelocityX = resolveThrowGestureVelocity(
            e.velocityX,
            smoothedThrowGestureVelocityX.value,
            e.translationX,
            stationaryGestureMs.value,
          )
          const dragScale = rangeScale * renderedWidthScale.value
          const normalizedVelocity = gestureVelocityX * THROW_DISTANCE_GAIN * dragScale
          const maxVelocity = MAX_THROW_VELOCITY * Math.max(0.2, dragScale)
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
            snapOffsetToNearest(translateX.value)
          } else {
            const stepIndex = Math.max(
              0,
              Math.min(totalSteps, Math.round(-translateX.value / stepPx)),
            )
            emitStepIndex(stepIndex)
          }
        }),
    [
      dragStartX,
      emitStepIndex,
      emitEdgeHaptic,
      isDragging,
      latestGestureTranslationX,
      momentumVelocity,
      pauseThrow,
      previousFrameGestureTranslationX,
      rangeScale,
      renderedWidthScale,
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
      lastStepIndex,
    ],
  )

  useEffect(() => {
    if (value === lastEmittedValue.value) {
      return
    }

    const expectedOffset = -valueToOffset(value)
    if (Math.abs(translateX.value - expectedOffset) > stepPx * 0.3) {
      lastEmittedValue.value = value
      lastStepIndex.value = Math.round((value - min) / step)
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
    lastEmittedValue,
    lastStepIndex,
  ])

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  useEffect(() => {
    valueBadgeScale.value = withSequence(
      withTiming(1.06, { duration: 80 }),
      withTiming(1, { duration: 140 }),
    )
  }, [value, valueBadgeScale])

  const valueBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: valueBadgeScale.value }],
  }))

  const prevMarkOffset = previousValue != null ? valueToOffset(previousValue) : null
  const previousValueLabel = previousValue != null ? formatTuneValue(previousValue) : null
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
      <View style={styles.container} onLayout={handleLayout}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={styles.gestureArea}>
            <Animated.View style={[styles.strip, { width: totalWidth + 1 }, stripStyle]}>
              {ticks}
              {prevMarkOffset != null && previousValueLabel != null && (
                <>
                  <View style={[styles.prevMarkTop, { left: prevMarkOffset }]} />
                  <View style={[styles.prevMarkBottom, { left: prevMarkOffset }]} />
                  <View style={[styles.prevValueRing, { left: prevMarkOffset }]}>
                    <Text style={styles.prevValueText}>{previousValueLabel}</Text>
                  </View>
                </>
              )}
            </Animated.View>
          </Animated.View>
        </GestureDetector>
        <View style={styles.indicator} pointerEvents="none" />
        <View style={styles.valueBadgeAnchor} pointerEvents="none">
          <Animated.View style={[styles.valueBadge, valueBadgeStyle]}>
            <Text style={styles.valueBadgeText}>{formatTuneValue(value)}</Text>
          </Animated.View>
        </View>
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
    height: 27,
    backgroundColor: MAJOR_TICK_COLOR,
    borderRadius: 1,
  },
  tickLabel: {
    color: LABEL_COLOR,
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
    marginTop: 9,
    width: 50,
    textAlign: 'center',
  },
  minorTick: {
    position: 'absolute',
    top: 12,
    width: 1,
    height: 13,
    backgroundColor: MINOR_TICK_COLOR,
    borderRadius: 0.5,
  },
  midpointTick: {
    position: 'absolute',
    top: 15,
    width: 1,
    height: 9,
    backgroundColor: MINOR_TICK_COLOR,
    borderRadius: 0.5,
  },
  prevMarkTop: {
    position: 'absolute',
    top: 0,
    width: MARKER_LINE_WIDTH,
    height: VALUE_MARKER_TOP,
    marginLeft: -MARKER_LINE_WIDTH / 2,
    backgroundColor: PREV_MARK_COLOR,
    borderRadius: 1,
  },
  prevMarkBottom: {
    position: 'absolute',
    top: VALUE_MARKER_TOP + VALUE_MARKER_SIZE,
    width: MARKER_LINE_WIDTH,
    height: DIAL_HEIGHT - VALUE_MARKER_TOP - VALUE_MARKER_SIZE,
    marginLeft: -MARKER_LINE_WIDTH / 2,
    backgroundColor: PREV_MARK_COLOR,
    borderRadius: 1,
  },
  prevValueRing: {
    position: 'absolute',
    top: VALUE_MARKER_TOP,
    width: VALUE_MARKER_SIZE,
    height: VALUE_MARKER_SIZE,
    marginLeft: -VALUE_MARKER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: PREV_MARK_COLOR,
    borderRadius: VALUE_MARKER_SIZE / 2,
  },
  prevValueText: {
    color: PREV_MARK_COLOR,
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
    textAlign: 'center',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: MARKER_LINE_WIDTH,
    marginLeft: -MARKER_LINE_WIDTH / 2,
    backgroundColor: INDICATOR_COLOR,
    borderRadius: 2,
    shadowColor: INDICATOR_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  valueBadge: {
    width: VALUE_MARKER_SIZE,
    height: VALUE_MARKER_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: INDICATOR_COLOR,
    borderRadius: VALUE_MARKER_SIZE / 2,
    shadowColor: INDICATOR_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 4,
    elevation: 5,
  },
  valueBadgeAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: DIAL_HEIGHT - VALUE_MARKER_TOP - VALUE_MARKER_SIZE,
    alignItems: 'center',
  },
  valueBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
    textAlign: 'center',
  },
})
