import { Pressable, StyleSheet, View } from 'react-native'
import { MarkerView } from '@rnmapbox/maps'

interface MapPinProps {
  id: string
  coordinate: [number, number]
  color: string
  onSelected?: () => void
}

export function MapPin({ coordinate, color, onSelected }: MapPinProps) {
  return (
    <MarkerView coordinate={coordinate} allowOverlap>
      <Pressable style={[styles.pin, { borderColor: color }]} onPress={onSelected}>
        <View style={[styles.pinCore, { backgroundColor: color }]} />
      </Pressable>
    </MarkerView>
  )
}

const styles = StyleSheet.create({
  pin: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 3,
    backgroundColor: '#f9fafb',
  },
  pinCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
