import { useCallback, useMemo, useState } from 'react'
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native'

import { theme } from '@/constants/theme'

interface RiderBalanceControlProps {
  value: number
  onValueChange: (value: number) => void
}

export function RiderBalanceControl({ value, onValueChange }: RiderBalanceControlProps) {
  const [width, setWidth] = useState(0)

  const updateFromX = useCallback(
    (x: number) => {
      const next = Math.max(-1, Math.min(1, 1 - (x / Math.max(width, 1)) * 2))
      onValueChange(Math.round(next * 100) / 100)
    },
    [onValueChange, width],
  )

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => updateFromX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateFromX(event.nativeEvent.locationX),
      }),
    [updateFromX],
  )

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    setWidth(nextWidth)
  }

  const adjust = (delta: number) => {
    onValueChange(Math.max(-1, Math.min(1, value + delta)))
  }

  return (
    <View style={styles.container}>
      <View style={styles.labels}>
        <Text style={styles.edgeLabel}>Nose</Text>
        <Text style={styles.title}>Rider balance</Text>
        <Text style={styles.edgeLabel}>Tail</Text>
      </View>
      <View
        style={styles.trackTouch}
        onLayout={handleLayout}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Rider balance"
        accessibilityValue={{ min: -100, max: 100, now: Math.round(value * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) =>
          adjust(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)
        }
        {...panResponder.panHandlers}
      >
        <View style={styles.track} />
        <View style={styles.centerMark} />
        <View style={[styles.thumb, { left: Math.max(0, ((1 - value) / 2) * width - 9) }]} />
      </View>
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
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.palette.sky.color,
    borderWidth: 2,
    borderColor: theme.palette.slate.textPrimary,
  },
})
