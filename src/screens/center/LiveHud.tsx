import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { BatteryIndicator, DualGaugeIndicator } from '@/components/cards'

interface LiveHudProps {
  visible: boolean
}

export function LiveHud({ visible }: LiveHudProps) {
  const insets = useSafeAreaInsets()
  if (!visible) return null

  return (
    <View
      style={[styles.wrap, { paddingTop: Math.max(insets.top + 46, 64) }]}
      pointerEvents="box-none"
    >
      <View style={styles.battery}>
        <BatteryIndicator compact transparent />
      </View>
      <View style={styles.gauge}>
        <DualGaugeIndicator compact transparent split />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 6,
    right: 6,
    zIndex: 10,
  },
  battery: {
    alignSelf: 'center',
    width: 176,
    maxWidth: '54%',
    transform: [{ scale: 0.68 }],
    marginBottom: -30,
  },
  gauge: {
    width: '100%',
  },
})
