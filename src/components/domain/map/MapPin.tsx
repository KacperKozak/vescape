import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MarkerView } from '@rnmapbox/maps'
import { TrashIcon, type Icon } from 'phosphor-react-native'
import { theme } from '@/constants/theme'

interface MapPinProps {
  id: string
  coordinate: [number, number]
  color: string
  icon?: Icon
  iconColor?: string
  bearingDeg?: number | null
  selected?: boolean
  expandSelected?: boolean
  label?: string
  onSelected?: () => void
  onRemove?: () => void
}

export function MapPin({
  coordinate,
  color,
  icon: IconComponent,
  iconColor,
  bearingDeg,
  selected = false,
  expandSelected = false,
  label,
  onSelected,
  onRemove,
}: MapPinProps) {
  if (IconComponent) {
    return (
      <MarkerView coordinate={coordinate} allowOverlap>
        {selected && expandSelected && label && onRemove ? (
          <View style={styles.selectedMapPoint}>
            <Pressable
              style={[styles.iconPin, styles.iconPinSelected, { borderColor: color }]}
              onPress={onSelected}
            >
              <IconComponent size={24} color={iconColor ?? color} weight="bold" />
            </Pressable>
            <View style={styles.selectedMapPointExtension}>
              <Text numberOfLines={1} style={styles.selectedMapPointLabel}>
                {label}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${label}`}
                style={styles.selectedMapPointDelete}
                onPress={onRemove}
              >
                <TrashIcon size={16} color={theme.error.text} weight="bold" />
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={[styles.iconPin, { borderColor: color }, selected && styles.iconPinSelected]}
            onPress={onSelected}
          >
            <IconComponent size={selected ? 24 : 15} color={iconColor ?? color} weight="bold" />
          </Pressable>
        )}
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
    backgroundColor: theme.neutral.textPrimary,
  },
  iconPin: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: theme.neutral.mapOverlayPin,
    opacity: 0.78,
    shadowColor: theme.neutral.surfaceDeep,
    shadowOpacity: 0.22,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  iconPinSelected: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    backgroundColor: theme.neutral.surfaceDeep,
    opacity: 1,
    shadowOpacity: 0.36,
    shadowRadius: 7,
    elevation: 8,
    zIndex: 2,
  },
  selectedMapPoint: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    transform: [{ translateX: 58 }],
  },
  selectedMapPointExtension: {
    minWidth: 88,
    maxWidth: 174,
    height: 36,
    marginLeft: -2,
    paddingLeft: 14,
    paddingRight: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 18,
    backgroundColor: theme.neutral.surfaceDeep,
    zIndex: 1,
  },
  selectedMapPointLabel: {
    flexShrink: 1,
    color: theme.neutral.textPrimary,
    fontSize: 12,
    fontWeight: '800',
  },
  selectedMapPointDelete: {
    width: 38,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
