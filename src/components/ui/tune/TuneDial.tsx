/* eslint-disable react-hooks/immutability */
import * as Haptics from 'expo-haptics'
import { useCallback, useEffect, useMemo } from 'react'
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

import { formatTuneValue } from '@/lib/tune/fields'
import { theme } from '@/constants/theme'
import {
  DRAG_RANGE_GAIN,
  THROW_STOP_VELOCITY,
  advanceTuneDialThrow,
  computeHapticStepSpacing,
  computeTuneDialLayout,
  isTuneDialEdgeStep,
  resolveTuneDialThrowVelocity,
  shouldApplyExternalTuneDialValue,
  shouldPlayTuneDialHaptic,
} from '@/components/ui/tune/tuneDialPhysics'

const DIAL_HEIGHT = 105
const TOP_VALUE_BAND_HEIGHT = 22
const MAJOR_TICK_TOP = TOP_VALUE_BAND_HEIGHT + 5
const RULER_LABEL_BAND_TOP = 76
const VALUE_LABEL_WIDTH = 28
const VALUE_LABEL_HEIGHT = 14
const CURRENT_VALUE_TOP = 2
const RULER_LABEL_BAND_BOTTOM = RULER_LABEL_BAND_TOP + VALUE_LABEL_HEIGHT
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
  const hapticStepSpacing = computeHapticStepSpacing()
  const initialStepIndex = Math.round((value - min) / step)

  const valueToOffset = useCallback(
    (v: number) => ((v - min) / range) * totalWidth,
    [min, range, totalWidth],
  )

  const translateX = useSharedValue(-valueToOffset(value))
  const dragStartX = useSharedValue(0)
  const interactionActive = useSharedValue(false)
  const momentumVelocity = useSharedValue(0)
  const lastEmittedValue = useSharedValue(value)
  const lastStepIndex = useSharedValue(initialStepIndex)
  const lastEdgeHapticStepIndex = useSharedValue(-1)

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
        if (isTuneDialEdgeStep(stepIndex, totalSteps)) {
          emitEdgeHaptic(stepIndex)
        } else if (
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
      emitEdgeHaptic,
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

  const settleOffsetToNearest = useCallback(
    (rawOffset: number) => {
      'worklet'
      const stepIndex = Math.max(0, Math.min(totalSteps, Math.round(-rawOffset / stepPx)))
      emitStepIndex(stepIndex)
      translateX.value = withSpring(-stepIndex * stepPx, SNAP_SPRING, (finished) => {
        if (finished) interactionActive.value = false
      })
    },
    [emitStepIndex, interactionActive, stepPx, totalSteps, translateX],
  )

  const pauseThrow = useCallback(() => {
    'worklet'
    cancelAnimation(translateX)
    momentumVelocity.value = 0
  }, [momentumVelocity, translateX])

  useFrameCallback((frame) => {
    const rawDt = frame.timeSincePreviousFrame ?? 16
    const speed = Math.abs(momentumVelocity.value)

    if (speed <= THROW_STOP_VELOCITY) {
      if (speed > 0) {
        momentumVelocity.value = 0
        settleOffsetToNearest(translateX.value)
      }
      return
    }

    const nextThrow = advanceTuneDialThrow(momentumVelocity.value, rawDt)
    let nextOffset = translateX.value + nextThrow.distance
    if (nextOffset > 0 || nextOffset < -totalWidth) {
      nextOffset = Math.max(-totalWidth, Math.min(0, nextOffset))
      momentumVelocity.value = 0
      const edgeStepIndex = Math.max(0, Math.min(totalSteps, Math.round(-nextOffset / stepPx)))
      translateX.value = withSpring(-edgeStepIndex * stepPx, SNAP_SPRING, (finished) => {
        if (finished) interactionActive.value = false
      })
      emitStepIndex(edgeStepIndex)
      emitEdgeHaptic(edgeStepIndex)
      return
    }

    momentumVelocity.value = nextThrow.velocity
    const nearestStepIndex = Math.max(0, Math.min(totalSteps, Math.round(-nextOffset / stepPx)))
    translateX.value = nextOffset
    emitStepIndex(nearestStepIndex, true)
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
          interactionActive.value = true
          dragStartX.value = translateX.value
          lastStepIndex.value = Math.round((value - min) / step)
        })
        .onUpdate((e) => {
          const raw = dragStartX.value + e.translationX * DRAG_RANGE_GAIN
          const clamped = Math.max(-totalWidth, Math.min(0, raw))
          translateX.value = clamped
          const stepIndex = Math.max(0, Math.min(totalSteps, Math.round(-clamped / stepPx)))
          emitStepIndex(stepIndex)
          if (raw > 0 || raw < -totalWidth) {
            emitEdgeHaptic(stepIndex)
          }
        })
        .onEnd((e) => {
          momentumVelocity.value = resolveTuneDialThrowVelocity(e.velocityX, e.translationX)
          if (momentumVelocity.value === 0) {
            settleOffsetToNearest(translateX.value)
          } else {
            const stepIndex = Math.max(
              0,
              Math.min(totalSteps, Math.round(-translateX.value / stepPx)),
            )
            emitStepIndex(stepIndex)
          }
        })
        .onFinalize((_e, success) => {
          if (!success && interactionActive.value) {
            settleOffsetToNearest(translateX.value)
          }
        }),
    [
      dragStartX,
      emitStepIndex,
      emitEdgeHaptic,
      interactionActive,
      momentumVelocity,
      pauseThrow,
      settleOffsetToNearest,
      stepPx,
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
    if (!shouldApplyExternalTuneDialValue(value, lastEmittedValue.value, interactionActive.value)) {
      return
    }

    const expectedOffset = -valueToOffset(value)
    if (Math.abs(translateX.value - expectedOffset) > stepPx * 0.3) {
      lastEmittedValue.value = value
      lastStepIndex.value = Math.round((value - min) / step)
      momentumVelocity.value = 0
      translateX.value = withSpring(expectedOffset, SNAP_SPRING)
    }
  }, [
    min,
    interactionActive,
    momentumVelocity,
    step,
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
      <View style={styles.container}>
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
        <View style={styles.indicatorTop} pointerEvents="none" />
        <View style={styles.indicatorBottom} pointerEvents="none" />
        <View style={styles.valueBadgeAnchor} pointerEvents="none">
          <View style={styles.valueBadge}>
            <Text style={styles.valueBadgeText}>{formatTuneValue(value)}</Text>
          </View>
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
    top: MAJOR_TICK_TOP,
    alignItems: 'center',
    width: 0,
  },
  majorTickLine: {
    width: 2,
    height: RULER_LABEL_BAND_TOP - MAJOR_TICK_TOP,
    backgroundColor: MAJOR_TICK_COLOR,
    borderRadius: 1,
  },
  tickLabel: {
    position: 'absolute',
    top: RULER_LABEL_BAND_TOP - MAJOR_TICK_TOP,
    color: LABEL_COLOR,
    fontSize: 9,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
    height: VALUE_LABEL_HEIGHT,
    textAlignVertical: 'center',
    width: 50,
    textAlign: 'center',
  },
  minorTick: {
    position: 'absolute',
    top: TOP_VALUE_BAND_HEIGHT + 9,
    width: 1,
    height: 36,
    backgroundColor: MINOR_TICK_COLOR,
    borderRadius: 0.5,
  },
  midpointTick: {
    position: 'absolute',
    top: TOP_VALUE_BAND_HEIGHT + 11,
    width: 1,
    height: 26,
    backgroundColor: MINOR_TICK_COLOR,
    borderRadius: 0.5,
  },
  prevMarkTop: {
    position: 'absolute',
    top: TOP_VALUE_BAND_HEIGHT,
    width: MARKER_LINE_WIDTH,
    height: RULER_LABEL_BAND_TOP - TOP_VALUE_BAND_HEIGHT,
    marginLeft: -MARKER_LINE_WIDTH / 2,
    backgroundColor: PREV_MARK_COLOR,
    borderRadius: 1,
  },
  prevMarkBottom: {
    position: 'absolute',
    top: RULER_LABEL_BAND_BOTTOM,
    width: MARKER_LINE_WIDTH,
    height: DIAL_HEIGHT - RULER_LABEL_BAND_BOTTOM,
    marginLeft: -MARKER_LINE_WIDTH / 2,
    backgroundColor: PREV_MARK_COLOR,
    borderRadius: 1,
  },
  prevValueRing: {
    position: 'absolute',
    top: RULER_LABEL_BAND_TOP,
    width: VALUE_LABEL_WIDTH,
    height: VALUE_LABEL_HEIGHT,
    marginLeft: -VALUE_LABEL_WIDTH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surface,
    borderRadius: 4,
  },
  prevValueText: {
    color: PREV_MARK_COLOR,
    fontSize: 9,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
    height: VALUE_LABEL_HEIGHT,
    textAlignVertical: 'center',
    textAlign: 'center',
  },
  indicatorTop: {
    position: 'absolute',
    top: TOP_VALUE_BAND_HEIGHT,
    left: '50%',
    width: MARKER_LINE_WIDTH,
    height: RULER_LABEL_BAND_TOP - TOP_VALUE_BAND_HEIGHT,
    marginLeft: -MARKER_LINE_WIDTH / 2,
    backgroundColor: INDICATOR_COLOR,
    borderRadius: 2,
    shadowColor: INDICATOR_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  indicatorBottom: {
    position: 'absolute',
    top: RULER_LABEL_BAND_BOTTOM,
    left: '50%',
    width: MARKER_LINE_WIDTH,
    height: DIAL_HEIGHT - RULER_LABEL_BAND_BOTTOM,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  valueBadgeAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: CURRENT_VALUE_TOP,
    alignItems: 'center',
  },
  valueBadgeText: {
    color: INDICATOR_COLOR,
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    lineHeight: 16,
    textAlign: 'center',
  },
})
