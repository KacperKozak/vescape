/* eslint-disable react-hooks/immutability */
import { useMemo } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'

import { theme } from '@/constants/theme'

interface RiderBalanceControlProps {
  value: SharedValue<number>
  onValueChangeEnd?: (value: number) => void
}

const THUMB_SIZE = 18

export function RiderBalanceControl({ value, onValueChangeEnd }: RiderBalanceControlProps) {
  const width = useSharedValue(0)

  const gesture = useMemo(() => {
    const updateFromX = (x: number) => {
      'worklet'
      const travel = Math.max(width.value - THUMB_SIZE, 1)
      const thumbLeft = Math.max(0, Math.min(travel, x - THUMB_SIZE / 2))
      value.value = Math.round((1 - (thumbLeft / travel) * 2) * 100) / 100
    }

    return Gesture.Pan()
      .minDistance(0)
      .onBegin((event) => updateFromX(event.x))
      .onUpdate((event) => updateFromX(event.x))
      .onFinalize(() => {
        if (onValueChangeEnd) runOnJS(onValueChangeEnd)(value.value)
      })
  }, [onValueChangeEnd, value, width])

  const thumbStyle = useAnimatedStyle(() => {
    const travel = Math.max(width.value - THUMB_SIZE, 0)
    return { transform: [{ translateX: ((1 - value.value) / 2) * travel }] }
  })

  const handleLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width
  }

  const adjust = (delta: number) => {
    value.value = Math.max(-1, Math.min(1, value.value + delta))
    onValueChangeEnd?.(value.value)
  }

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={styles.edgeLabel}>Nose</Text>
        <Text style={styles.title}>Rider balance</Text>
        <Text style={styles.edgeLabel}>Tail</Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.trackTouch}
          onLayout={handleLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Rider balance"
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            adjust(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)
          }
        >
          <View style={styles.track} />
          <View style={styles.centerMark} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 5 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: theme.palette.slate.text, fontSize: 11, fontWeight: '800' },
  edgeLabel: { color: theme.palette.slate.textMuted, fontSize: 10, fontWeight: '700' },
  trackTouch: { height: 30, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: theme.palette.slate.border },
  centerMark: {
    position: 'absolute',
    left: '50%',
    width: 1,
    height: 10,
    backgroundColor: theme.palette.slate.textMuted,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: theme.palette.sky.color,
    borderWidth: 2,
    borderColor: theme.palette.slate.textPrimary,
  },
})
