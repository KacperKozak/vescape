import { MapOptionSelector } from '@/components/map/MapOptionSelector'
import { MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'

interface MapStyleSwitchProps {
  activeKey: MapStyleKey
  expanded: boolean
  onToggle: () => void
  onSelect: (key: MapStyleKey) => void
}

export function MapStyleSwitch({ activeKey, expanded, onToggle, onSelect }: MapStyleSwitchProps) {
  const activeStyle = MAP_STYLES.find((style) => style.key === activeKey) ?? MAP_STYLES[0]
  const options = MAP_STYLES.map((style) => ({
    key: style.key,
    label: style.label,
    icon: (
      <style.Icon
        size={21}
        color={activeKey === style.key ? theme.wheel.text : theme.neutral.textSecondary}
        weight={activeKey === style.key ? 'fill' : 'bold'}
      />
    ),
  }))

  return (
    <MapOptionSelector
      activeKey={activeKey}
      activeIcon={<activeStyle.Icon size={21} color={theme.wheel.text} weight="fill" />}
      activeColor={theme.wheel.text}
      activeBackground={`${theme.wheel.color}1f`}
      collapsedAccessibilityLabel={`Basemap: ${activeStyle.label}`}
      expanded={expanded}
      options={options}
      onToggle={onToggle}
      onSelect={onSelect}
    />
  )
}
