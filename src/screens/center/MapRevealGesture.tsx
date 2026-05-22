/* eslint-disable react-hooks/immutability */
import { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

interface MapRevealGestureProps {
  progress: SharedValue<number>
  dragOpacity: SharedValue<number>
  onPan: (deltaX: number, deltaY: number, animationDuration?: number) => void
  onReveal: () => void
  onFinish: (revealed: boolean) => void
}

const REVEAL_DISTANCE_DP = 190
const RESISTANCE_AT_BREAK = 0.32
const BREAK_RELEASE_MS = 130
const FADE_TIMING = { duration: 260 } as const
const REVEAL_SPRING = {
  damping: 18,
  stiffness: 160,
  mass: 0.8,
} as const

export function MapRevealGesture({
  progress,
  dragOpacity,
  onPan,
  onReveal,
  onFinish,
}: MapRevealGestureProps) {
  const completed = useSharedValue(false)
  const appliedX = useSharedValue(0)
  const appliedY = useSharedValue(0)

  const setProgress = useCallback(
    (next: number | Parameters<typeof withSpring>[1]) => {
      progress.value = next as never
    },
    [progress],
  )

  const setDragOpacity = useCallback(
    (next: number | Parameters<typeof withTiming>[1]) => {
      dragOpacity.value = next as never
    },
    [dragOpacity],
  )

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onBegin(() => {
          completed.value = false
          appliedX.value = 0
          appliedY.value = 0
          scheduleOnRN(setProgress, 0)
          scheduleOnRN(setDragOpacity, 0)
        })
        .onUpdate((event) => {
          const distance = Math.hypot(event.translationX, event.translationY)
          const nextProgress = Math.min(1, distance / REVEAL_DISTANCE_DP)
          const easedProgress = nextProgress * nextProgress
          scheduleOnRN(setDragOpacity, nextProgress)

          if (completed.value) {
            const deltaX = event.translationX - appliedX.value
            const deltaY = event.translationY - appliedY.value
            appliedX.value = event.translationX
            appliedY.value = event.translationY
            scheduleOnRN(onPan, deltaX, deltaY)
            return
          }

          if (distance >= REVEAL_DISTANCE_DP) {
            completed.value = true
            scheduleOnRN(setProgress, 1)
            scheduleOnRN(setDragOpacity, 1)
            const deltaX = event.translationX - appliedX.value
            const deltaY = event.translationY - appliedY.value
            appliedX.value = event.translationX
            appliedY.value = event.translationY
            scheduleOnRN(onPan, deltaX, deltaY, BREAK_RELEASE_MS)
            scheduleOnRN(onReveal)
            return
          }

          const panGain = 1 - RESISTANCE_AT_BREAK * easedProgress
          const nextAppliedX = event.translationX * panGain
          const nextAppliedY = event.translationY * panGain
          const deltaX = nextAppliedX - appliedX.value
          const deltaY = nextAppliedY - appliedY.value
          appliedX.value = nextAppliedX
          appliedY.value = nextAppliedY
          scheduleOnRN(setProgress, easedProgress)
          scheduleOnRN(onPan, deltaX, deltaY)
        })
        .onFinalize(() => {
          if (!completed.value) {
            scheduleOnRN(setProgress, withSpring(0, REVEAL_SPRING))
            scheduleOnRN(setDragOpacity, withTiming(0, FADE_TIMING))
          }
          scheduleOnRN(onFinish, completed.value)
        }),
    [appliedX, appliedY, completed, onFinish, onPan, onReveal, setDragOpacity, setProgress],
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
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
})
