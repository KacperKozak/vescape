import { Pressable, StyleSheet, View } from 'react-native'
import { MarkerView } from '@rnmapbox/maps'
import type { Icon } from 'phosphor-react-native'

interface MapPinProps {
  id: string
  coordinate: [number, number]
  color: string
  icon?: Icon
  iconColor?: string
  onSelected?: () => void
}

export function MapPin({
  coordinate,
  color,
  icon: IconComponent,
  iconColor,
  onSelected,
}: MapPinProps) {
  if (IconComponent) {
    return (
      <MarkerView coordinate={coordinate} allowOverlap>
        <Pressable style={[styles.iconPin, { borderColor: color }]} onPress={onSelected}>
          <IconComponent size={11} color={iconColor ?? color} weight="bold" />
        </Pressable>
      </MarkerView>
    )
  }

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
  iconPin: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
    opacity: 0.78,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  pinCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
