import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { theme } from '@/constants/theme'

interface Props {
  id: string
  name: string
  rssi: number
  onPress: () => void
}

/** A single row in the device scan list. */
export const DeviceRow = React.memo(function DeviceRow({ id, name, rssi, onPress }: Props) {
  const signalColor =
    rssi > -60 ? theme.gps.text : rssi > -75 ? theme.highlight.color : theme.error.text

  return (
    <Pressable
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
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
    backgroundColor: '#1f2937',
    borderRadius: 10,
    marginBottom: 8,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: '#f9fafb',
    fontSize: 16,
    fontWeight: '600',
  },
  rssi: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  id: {
    color: '#9ca3af',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  chevron: {
    color: '#6b7280',
    fontSize: 22,
    fontWeight: '300',
  },
})
