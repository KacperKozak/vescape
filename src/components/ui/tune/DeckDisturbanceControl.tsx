/* eslint-disable react-hooks/immutability */
import { useMemo, useState } from 'react'
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { scheduleOnRN } from 'react-native-worklets'

import { theme } from '@/constants/theme'
import { MAX_DECK_DISTURBANCE_DEGREES } from '@/lib/tune/tunePreview'

interface DeckDisturbanceControlProps {
  angleDegrees: SharedValue<number>
  active: SharedValue<boolean>
}

const THUMB_SIZE = 18

export function DeckDisturbanceControl({ angleDegrees, active }: DeckDisturbanceControlProps) {
  const width = useSharedValue(0)
  const [angleText, setAngleText] = useState('0.0°')

  const gesture = useMemo(() => {
    const updateFromX = (x: number) => {
      'worklet'
      const travel = Math.max(width.value - THUMB_SIZE, 1)
      const thumbLeft = Math.max(0, Math.min(travel, x - THUMB_SIZE / 2))
      angleDegrees.value =
        Math.round(((thumbLeft / travel) * 2 - 1) * MAX_DECK_DISTURBANCE_DEGREES * 10) / 10
    }

    return Gesture.Pan()
      .minDistance(0)
      .onBegin((event) => {
        active.value = true
        updateFromX(event.x)
      })
      .onUpdate((event) => updateFromX(event.x))
      .onFinalize(() => {
        active.value = false
        angleDegrees.value = 0
      })
  }, [active, angleDegrees, width])

  const thumbStyle = useAnimatedStyle(() => {
    const travel = Math.max(width.value - THUMB_SIZE, 0)
    const normalized = angleDegrees.value / MAX_DECK_DISTURBANCE_DEGREES
    return { transform: [{ translateX: ((1 + normalized) / 2) * travel }] }
  })
  useAnimatedReaction(
    () => {
      const angle = angleDegrees.value
      return `${angle > 0 ? '+' : ''}${angle.toFixed(1)}°`
    },
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setAngleText, next)
    },
  )

  const handleLayout = (event: LayoutChangeEvent) => {
    width.value = event.nativeEvent.layout.width
  }

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={styles.edgeLabel}>Nose</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Deck disturbance</Text>
          <Text style={styles.angle}>{angleText}</Text>
        </View>
        <Text style={styles.edgeLabel}>Tail</Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.trackTouch}
          onLayout={handleLayout}
          accessible
          accessibilityLabel="Hold and drag to disturb the deck angle, then release"
        >
          <View style={styles.track} />
          <View style={styles.centerMark} />
          <Animated.View style={[styles.thumb, thumbStyle]} />
        </View>
      </GestureDetector>
      <Text style={styles.hint}>Hold to set Board angle · release to let the tune recover</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 5 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { color: theme.palette.slate.text, fontSize: 11, fontWeight: '800' },
  angle: {
    width: 43,
    padding: 0,
    color: theme.telemetry.pitch,
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  edgeLabel: { color: theme.palette.slate.textMuted, fontSize: 10, fontWeight: '700' },
  hint: {
    color: theme.palette.slate.textMuted,
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
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
