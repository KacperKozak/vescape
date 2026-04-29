import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'

interface Props {
  name: string
  rssi: number
  onPress: () => void
}

/** A single row in the device scan list. */
export function DeviceRow({ name, rssi, onPress }: Props) {
  const signalColor = rssi > -60 ? '#4ade80' : rssi > -75 ? '#facc15' : '#f87171'

  return (
    <Pressable
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      onPress={onPress}
    >
      <View style={styles.info}>
        <Text style={styles.name}>{name}</Text>
        <Text style={[styles.rssi, { color: signalColor }]}>{rssi} dBm</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  )
}

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
  chevron: {
    color: '#6b7280',
    fontSize: 22,
    fontWeight: '300',
  },
})
