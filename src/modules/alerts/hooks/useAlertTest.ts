import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { startAlertTest, stopAlertTest, updateAlertTest, type AlertTestRule } from 'vescape-core'

import { highRangeAlertTestEasing } from '@/modules/alerts/lib/alertTest'

const STANDARD_LEG_DURATION_MS = 5_000
const BATTERY_DRAIN_DURATION_MS = 8_000
const HIGH_RANGE_SWEEP_DURATION_MS = 8_000
const FAST_RESET_DURATION_MS = 600
const SAMPLE_INTERVAL_MS = 100

interface AlertTestOptions {
  rules: AlertTestRule[]
  min: number
  max: number
  /** Battery alerts below their threshold, so their natural test starts full and sweeps down. */
  alertAbove: boolean
  /** Speed and duty need most of their test time in the high alert range. */
  lingerNearMax: boolean
}

/** Own the synthetic gauge sweep and its isolated native alert-engine lifecycle. */
export function useAlertTest({ rules, min, max, alertAbove, lingerNearMax }: AlertTestOptions) {
  const value = useSharedValue<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [running, setRunning] = useState(false)

  const stop = useCallback(() => {
    if (timer.current != null) {
      clearInterval(timer.current)
      timer.current = null
    }
    cancelAnimation(value)
    value.set(null)
    stopAlertTest()
    setRunning(false)
  }, [value])

  const start = useCallback(() => {
    if (rules.length === 0 || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return
    stop()

    const startValue = alertAbove ? min : max
    const turnValue = alertAbove ? max : min
    const outboundDuration = lingerNearMax
      ? HIGH_RANGE_SWEEP_DURATION_MS
      : alertAbove
        ? STANDARD_LEG_DURATION_MS
        : BATTERY_DRAIN_DURATION_MS
    const returnDuration =
      lingerNearMax || !alertAbove ? FAST_RESET_DURATION_MS : STANDARD_LEG_DURATION_MS
    const outboundEasing = lingerNearMax ? highRangeAlertTestEasing : Easing.inOut(Easing.quad)
    const returnEasing = Easing.inOut(Easing.quad)
    const startedAt = Date.now()
    const totalDuration = outboundDuration + returnDuration

    value.set(startValue)
    value.set(
      withSequence(
        withTiming(turnValue, {
          duration: outboundDuration,
          easing: outboundEasing,
        }),
        withTiming(startValue, {
          duration: returnDuration,
          easing: returnEasing,
        }),
      ),
    )
    startAlertTest(rules)
    updateAlertTest(startValue)
    setRunning(true)

    timer.current = setInterval(() => {
      const elapsed = Date.now() - startedAt
      if (elapsed >= totalDuration) {
        updateAlertTest(startValue)
        stop()
        return
      }

      const outbound = elapsed < outboundDuration
      const legProgress = outbound
        ? elapsed / outboundDuration
        : (elapsed - outboundDuration) / returnDuration
      const eased = outbound ? outboundEasing(legProgress) : returnEasing(legProgress)
      const from = outbound ? startValue : turnValue
      const to = outbound ? turnValue : startValue
      updateAlertTest(from + (to - from) * eased)
    }, SAMPLE_INTERVAL_MS)
  }, [alertAbove, lingerNearMax, max, min, rules, stop, value])

  // A route can blur without unmounting. Blur cleanup guarantees no test survives leaving a page.
  useFocusEffect(useCallback(() => stop, [stop]))
  // A level/rule/range change invalidates the snapshot currently being tested.
  useEffect(() => stop, [max, min, rules, stop])

  return {
    value,
    running,
    canRun: rules.length > 0,
    start,
    stop,
  }
}
