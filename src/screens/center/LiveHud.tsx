import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { DualGaugeIndicator } from '@/components/cards'

export function LiveHud() {
  const insets = useSafeAreaInsets()

  return (
    <View
      style={[styles.wrap, { paddingTop: Math.max(insets.top + 46, 64) }]}
      pointerEvents="box-none"
    >
      <DualGaugeIndicator compact transparent />
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
})
