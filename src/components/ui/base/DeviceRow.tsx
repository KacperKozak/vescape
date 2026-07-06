import React from 'react'
import { Pressable, View, StyleSheet } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { theme, interaction } from '@/constants/theme'

interface Props {
  id: string
  name: string
  rssi: number
  onPress: () => void
}

export const DeviceRow = React.memo(function DeviceRow({ id, name, rssi, onPress }: Props) {
  const signalColor =
    rssi > -60
      ? theme.palette.green.text
      : rssi > -75
        ? theme.palette.yellow.color
        : theme.status.error.text

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: interaction.pressedOpacity }]}
      android_ripple={interaction.ripple}
      onPress={onPress}
      testID={`device-row-${id}`}
      accessibilityLabel={name}
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
    backgroundColor: theme.palette.slate.surface,
    borderRadius: 10,
    marginBottom: 8,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: theme.palette.slate.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  rssi: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  id: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontFamily: 'monospace',
  },
  chevron: {
    color: theme.palette.slate.textDim,
    fontSize: 22,
    fontWeight: '300',
  },
})
