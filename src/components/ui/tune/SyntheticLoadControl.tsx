/* eslint-disable react-hooks/immutability */
import { useMemo } from 'react'
import { StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'

import { theme } from '@/constants/theme'
import { MAX_SYNTHETIC_CURRENT_AMPS } from '@/lib/tune/tunePreview'

interface SyntheticLoadControlProps {
  value: SharedValue<number>
  onValueChangeEnd?: (value: number) => void
}

const THUMB_SIZE = 18
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

export function SyntheticLoadControl({ value, onValueChangeEnd }: SyntheticLoadControlProps) {
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
  const currentTextProps = useAnimatedProps(() => {
    const current = value.value * MAX_SYNTHETIC_CURRENT_AMPS
    const text = `${current > 0 ? '+' : ''}${current.toFixed(0)} A`
    return { text, value: text }
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
        <Text style={styles.edgeLabel}>Drive</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Synthetic load</Text>
          <AnimatedTextInput
            editable={false}
            defaultValue="0 A"
            animatedProps={currentTextProps}
            style={styles.current}
          />
        </View>
        <Text style={styles.edgeLabel}>Regen</Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.trackTouch}
          onLayout={handleLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Synthetic load"
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
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { color: theme.palette.slate.text, fontSize: 11, fontWeight: '800' },
  current: {
    width: 42,
    padding: 0,
    color: theme.telemetry.motorCurrent,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
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
