import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { theme, interaction } from '@/constants/theme'

interface Props {
  id: string
  name: string
  rssi: number
  onPress: () => void
}

export const DeviceRow = React.memo(function DeviceRow({ id, name, rssi, onPress }: Props) {
  const signalColor =
    rssi > -60 ? theme.gps.text : rssi > -75 ? theme.highlight.color : theme.error.text

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: interaction.pressedOpacity }]}
      android_ripple={interaction.ripple}
      onPress={onPress}
    >
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.id}>{id}</Text>
        <Text style={[styles.rssi, { color: signalColor }]}>{rssi} dBm</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
})

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: theme.neutral.surface,
    borderRadius: 10,
    marginBottom: 8,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  rssi: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  id: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  chevron: {
    color: theme.neutral.textDim,
    fontSize: 22,
    fontWeight: '300',
  },
})
