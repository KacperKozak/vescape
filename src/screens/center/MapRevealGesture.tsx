import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import {
  runOnJS,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

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

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .onBegin(() => {
          completed.value = false
          appliedX.value = 0
          appliedY.value = 0
          progress.value = 0
          dragOpacity.value = 0
        })
        .onUpdate((event) => {
          const distance = Math.hypot(event.translationX, event.translationY)
          const nextProgress = Math.min(1, distance / REVEAL_DISTANCE_DP)
          const easedProgress = nextProgress * nextProgress
          dragOpacity.value = nextProgress

          if (completed.value) {
            const deltaX = event.translationX - appliedX.value
            const deltaY = event.translationY - appliedY.value
            appliedX.value = event.translationX
            appliedY.value = event.translationY
            runOnJS(onPan)(deltaX, deltaY)
            return
          }

          if (distance >= REVEAL_DISTANCE_DP) {
            completed.value = true
            progress.value = 1
            dragOpacity.value = 1
            const deltaX = event.translationX - appliedX.value
            const deltaY = event.translationY - appliedY.value
            appliedX.value = event.translationX
            appliedY.value = event.translationY
            runOnJS(onPan)(deltaX, deltaY, BREAK_RELEASE_MS)
            runOnJS(onReveal)()
            return
          }

          const panGain = 1 - RESISTANCE_AT_BREAK * easedProgress
          const nextAppliedX = event.translationX * panGain
          const nextAppliedY = event.translationY * panGain
          const deltaX = nextAppliedX - appliedX.value
          const deltaY = nextAppliedY - appliedY.value
          appliedX.value = nextAppliedX
          appliedY.value = nextAppliedY
          progress.value = easedProgress
          runOnJS(onPan)(deltaX, deltaY)
        })
        .onFinalize(() => {
          if (!completed.value) {
            progress.value = withSpring(0, REVEAL_SPRING)
            dragOpacity.value = withTiming(0, FADE_TIMING)
          }
          runOnJS(onFinish)(completed.value)
        }),
    [appliedX, appliedY, completed, dragOpacity, onFinish, onPan, onReveal, progress],
  )

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.hitArea} />
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  hitArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
})
