import { Pressable, StyleSheet, Text, View } from 'react-native'
import { MarkerView, PointAnnotation } from '@rnmapbox/maps'
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
  id,
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
    if (selected && expandSelected && label && onRemove) {
      return (
        <MarkerView coordinate={coordinate} allowOverlap>
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
                <TrashIcon size={16} color={theme.status.error.text} weight="bold" />
              </Pressable>
            </View>
          </View>
        </MarkerView>
      )
    }

    return (
      <PointAnnotation id={id} coordinate={coordinate} onSelected={onSelected}>
        <View style={[styles.iconPin, { borderColor: color }, selected && styles.iconPinSelected]}>
          <IconComponent size={selected ? 24 : 15} color={iconColor ?? color} weight="bold" />
        </View>
      </PointAnnotation>
    )
  }

  if (bearingDeg != null) {
    return (
      <PointAnnotation id={id} coordinate={coordinate} onSelected={onSelected}>
        <View style={[styles.pin, { borderColor: color }]}>
          <View style={[styles.directionArrow, { transform: [{ rotate: `${bearingDeg}deg` }] }]}>
            <View
              style={[styles.directionWing, styles.directionWingOutline, styles.directionWingLeft]}
            />
            <View
              style={[styles.directionWing, styles.directionWingOutline, styles.directionWingRight]}
            />
            <View
              style={[styles.directionWing, styles.directionWingLeft, { borderColor: color }]}
            />
            <View
              style={[styles.directionWing, styles.directionWingRight, { borderColor: color }]}
            />
          </View>
        </View>
      </PointAnnotation>
    )
  }

  return (
    <PointAnnotation id={id} coordinate={coordinate} onSelected={onSelected}>
      <View style={[styles.pin, { borderColor: color }]}>
        <View style={[styles.pinCore, { backgroundColor: color }]} />
      </View>
    </PointAnnotation>
  )
}

const styles = StyleSheet.create({
  pin: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 3,
    backgroundColor: theme.palette.slate.textPrimary,
  },
  iconPin: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 2,
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.6),
    opacity: 0.78,
    shadowColor: theme.palette.slate.surfaceDeep,
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
    backgroundColor: theme.palette.slate.surfaceDeep,
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
    backgroundColor: theme.palette.slate.surfaceDeep,
    zIndex: 1,
  },
  selectedMapPointLabel: {
    flexShrink: 1,
    color: theme.palette.slate.textPrimary,
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
    width: 11,
    height: 11,
    borderRadius: 5.5,
  },
  directionArrow: {
    width: 27,
    height: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionWing: {
    position: 'absolute',
    top: 2,
    width: 3,
    height: 20,
    borderRadius: 1.5,
    borderLeftWidth: 4,
  },
  directionWingOutline: {
    top: 0,
    height: 24,
    borderRadius: 2.5,
    borderLeftWidth: 7,
    borderColor: theme.palette.mono.white,
  },
  directionWingLeft: {
    transform: [{ translateX: -4.5 }, { rotate: '28deg' }],
  },
  directionWingRight: {
    transform: [{ translateX: 4.5 }, { rotate: '-28deg' }],
  },
})
