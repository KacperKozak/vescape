import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/base/Text'
import type { ChartAlertMarkerLayout } from '@/components/charts/chartMath'
import { theme } from '@/constants/theme'

const LABEL_COLOR = theme.alpha(theme.palette.yellow.color, 0.6)

interface ChartAlertAxisLabelsProps {
  markers: ChartAlertMarkerLayout[]
  formatValue: (value: number) => string
}

/** Collision-adjusted values for faint alert lines drawn in the neighboring chart canvas. */
export function ChartAlertAxisLabels({ markers, formatValue }: ChartAlertAxisLabelsProps) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      {markers.map((marker) => (
        <Text key={marker.value} style={[styles.label, { top: marker.labelTop }]} numberOfLines={1}>
          {formatValue(marker.value)}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  label: {
    position: 'absolute',
    right: 14,
    color: LABEL_COLOR,
    fontSize: 7,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    lineHeight: 8,
  },
})
