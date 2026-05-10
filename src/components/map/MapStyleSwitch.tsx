import { Pressable, StyleSheet, View } from 'react-native'
import { type Icon } from 'phosphor-react-native'
import { MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'

interface MapStyleSwitchProps {
  activeKey: MapStyleKey
  onSelect: (key: MapStyleKey) => void
}

export function MapStyleSwitch({ activeKey, onSelect }: MapStyleSwitchProps) {
  return (
    <View style={styles.container}>
      {MAP_STYLES.map((style) => (
        <MapStyleButton
          key={style.key}
          Icon={style.Icon}
          label={style.label}
          active={activeKey === style.key}
          onPress={() => onSelect(style.key)}
        />
      ))}
    </View>
  )
}

function MapStyleButton({
  Icon,
  label,
  active,
  onPress,
}: {
  Icon: Icon
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[styles.button, active && styles.buttonActive]}
      onPress={onPress}
    >
      <Icon size={21} color={active ? '#61afef' : '#9ca3af'} weight={active ? 'fill' : 'bold'} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 46,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 4,
  },
  button: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
  },
  buttonActive: {
    backgroundColor: '#3d4556',
  },
})
