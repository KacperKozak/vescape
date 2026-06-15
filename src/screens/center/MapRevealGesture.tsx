import { useCallback, useEffect, useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { withSpring, withTiming, type SharedValue } from 'react-native-reanimated'

import { theme } from '@/constants/theme'
import { getBreakoutReleasePan, getResistedRevealPan } from '@/screens/center/mapRevealMotion'

interface MapRevealGestureProps {
  progress: SharedValue<number>
  dragOpacity: SharedValue<number>
  onPanStart: () => void
  onPan: (totalX: number, totalY: number, animationDuration?: number) => void
  onZoomStart: () => void
  onZoom: (scale: number) => void
  onZoomEnd: () => void
  onReveal: () => void
  onFinish: (revealed: boolean, accumulatedX?: number, accumulatedY?: number) => void
}

const REVEAL_DISTANCE_DP = 120
const RESISTANCE_AT_BREAK = 0.38
const BREAK_RELEASE_MS = 100
const FADE_TIMING = { duration: 260 } as const
const REVEAL_SPRING = {
  damping: 18,
  stiffness: 160,
  mass: 0.8,
} as const

function createMapRevealGesture({
  progress,
  dragOpacity,
  onPanStart,
  onPan,
  onZoomStart,
  onZoom,
  onZoomEnd,
  onReveal,
  onFinish,
}: MapRevealGestureProps) {
  let completed = false
  let appliedX = 0
  let appliedY = 0
  let breakoutX = 0
  let breakoutY = 0
  let breakoutStartedAt = 0
  let pinching = false

  const pan = Gesture.Pan()
    .runOnJS(true)
    .maxPointers(1)
    .minDistance(4)
    .onTouchesDown(() => {
      completed = false
      appliedX = 0
      appliedY = 0
      breakoutX = 0
      breakoutY = 0
      breakoutStartedAt = 0
      progress.value = 0
      dragOpacity.value = 0
    })
    .onBegin(() => {
      completed = false
      appliedX = 0
      appliedY = 0
      breakoutX = 0
      breakoutY = 0
      breakoutStartedAt = 0
      progress.value = 0
      dragOpacity.value = 0
      onPanStart()
    })
    .onStart(() => {
      completed = false
      appliedX = 0
      appliedY = 0
      breakoutX = 0
      breakoutY = 0
      breakoutStartedAt = 0
      progress.value = 0
      dragOpacity.value = 0
    })
    .onUpdate((event) => {
      const distance = Math.hypot(event.translationX, event.translationY)
      const shouldReveal = distance >= REVEAL_DISTANCE_DP
      const nextProgress = Math.min(1, distance / REVEAL_DISTANCE_DP)
      const easedProgress = nextProgress * nextProgress
      dragOpacity.value = nextProgress

      if (completed) {
        const releasedPan = getBreakoutReleasePan(
          event.translationX,
          event.translationY,
          breakoutX,
          breakoutY,
          Date.now() - breakoutStartedAt,
          BREAK_RELEASE_MS,
        )
        appliedX = releasedPan.x
        appliedY = releasedPan.y
        onPan(appliedX, appliedY)
        return
      }

      if (shouldReveal) {
        completed = true
        progress.value = 1
        dragOpacity.value = 1
        const resistedPan = getResistedRevealPan(
          event.translationX,
          event.translationY,
          REVEAL_DISTANCE_DP,
          RESISTANCE_AT_BREAK,
        )
        appliedX = resistedPan.x
        appliedY = resistedPan.y
        breakoutX = resistedPan.x
        breakoutY = resistedPan.y
        breakoutStartedAt = Date.now()
        onPan(appliedX, appliedY)
        onReveal()
        return
      }

      const resistedPan = getResistedRevealPan(
        event.translationX,
        event.translationY,
        REVEAL_DISTANCE_DP,
        RESISTANCE_AT_BREAK,
      )
      appliedX = resistedPan.x
      appliedY = resistedPan.y
      progress.value = easedProgress
      onPan(appliedX, appliedY)
    })
    .onFinalize((event) => {
      const wasCompleted = completed
      if (pinching) {
        completed = false
        appliedX = 0
        appliedY = 0
        breakoutX = 0
        breakoutY = 0
        breakoutStartedAt = 0
        return
      }
      if (!completed) {
        progress.value = withSpring(0, REVEAL_SPRING)
        dragOpacity.value = withTiming(0, FADE_TIMING)
      }
      completed = false
      appliedX = 0
      appliedY = 0
      breakoutX = 0
      breakoutY = 0
      breakoutStartedAt = 0
      onFinish(wasCompleted)
    })

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => {
      pinching = true
      completed = false
      appliedX = 0
      appliedY = 0
      breakoutX = 0
      breakoutY = 0
      breakoutStartedAt = 0
      progress.value = 0
      dragOpacity.value = 0
      onZoomStart()
    })
    .onUpdate((event) => {
      onZoom(event.scale)
    })
    .onFinalize(() => {
      pinching = false
      onZoomEnd()
    })

  return Gesture.Simultaneous(pan, pinch)
}

function useLatestCallback<Args extends unknown[]>(callback: (...args: Args) => void) {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])
  return useCallback((...args: Args) => callbackRef.current(...args), [])
}

export function MapRevealGesture({
  progress,
  dragOpacity,
  onPanStart,
  onPan,
  onZoomStart,
  onZoom,
  onZoomEnd,
  onReveal,
  onFinish,
}: MapRevealGestureProps) {
  'use no memo'
  const handlePanStart = useLatestCallback(onPanStart)
  const handlePan = useLatestCallback(onPan)
  const handleZoomStart = useLatestCallback(onZoomStart)
  const handleZoom = useLatestCallback(onZoom)
  const handleZoomEnd = useLatestCallback(onZoomEnd)
  const handleReveal = useLatestCallback(onReveal)
  const handleFinish = useLatestCallback(onFinish)

  const gesture = useMemo(
    () =>
      createMapRevealGesture({
        progress,
        dragOpacity,
        onPanStart: handlePanStart,
        onPan: handlePan,
        onZoomStart: handleZoomStart,
        onZoom: handleZoom,
        onZoomEnd: handleZoomEnd,
        onReveal: handleReveal,
        onFinish: handleFinish,
      }),
    [
      dragOpacity,
      handleFinish,
      handlePan,
      handlePanStart,
      handleReveal,
      handleZoom,
      handleZoomEnd,
      handleZoomStart,
      progress,
    ],
  )

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.hitArea} />
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  hitArea: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    backgroundColor: theme.neutral.touchInvisible,
  },
})
