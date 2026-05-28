import { Pressable, StyleSheet, View } from 'react-native'
import { MarkerView } from '@rnmapbox/maps'
import type { Icon } from 'phosphor-react-native'

interface MapPinProps {
  id: string
  coordinate: [number, number]
  color: string
  icon?: Icon
  iconColor?: string
  bearingDeg?: number | null
  onSelected?: () => void
}

export function MapPin({
  coordinate,
  color,
  icon: IconComponent,
  iconColor,
  bearingDeg,
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
        {bearingDeg == null ? (
          <View style={[styles.pinCore, { backgroundColor: color }]} />
        ) : (
          <View style={[styles.directionArrow, { transform: [{ rotate: `${bearingDeg}deg` }] }]}>
            <View
              style={[styles.directionWing, styles.directionWingLeft, { borderColor: color }]}
            />
            <View
              style={[styles.directionWing, styles.directionWingRight, { borderColor: color }]}
            />
          </View>
        )}
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
  directionArrow: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionWing: {
    position: 'absolute',
    top: 3,
    width: 2,
    height: 13,
    borderRadius: 1,
    borderLeftWidth: 2,
  },
  directionWingLeft: {
    transform: [{ translateX: -3 }, { rotate: '28deg' }],
  },
  directionWingRight: {
    transform: [{ translateX: 3 }, { rotate: '-28deg' }],
  },
})
