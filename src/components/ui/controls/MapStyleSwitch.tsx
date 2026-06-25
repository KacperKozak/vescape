import { MapOptionSelector } from '@/components/ui/controls/MapOptionSelector'
import { IS_MAPY_CONFIGURED } from '@/config/mapy'
import { MAP_STYLES, type MapStyleKey } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'

interface MapStyleSwitchProps {
  activeKey: MapStyleKey
  expanded: boolean
  onToggle: () => void
  onSelect: (key: MapStyleKey) => void
}

export function MapStyleSwitch({ activeKey, expanded, onToggle, onSelect }: MapStyleSwitchProps) {
  const availableStyles = IS_MAPY_CONFIGURED
    ? MAP_STYLES
    : MAP_STYLES.filter((style) => style.key !== 'mapy')
  const effectiveActiveKey =
    activeKey === 'mapy' && !IS_MAPY_CONFIGURED ? MAP_STYLES[0].key : activeKey
  const activeStyle =
    availableStyles.find((style) => style.key === effectiveActiveKey) ?? MAP_STYLES[0]
  const options = availableStyles.map((style) => ({
    key: style.key,
    label: style.label,
    icon: (
      <style.Icon
        size={21}
        color={
          effectiveActiveKey === style.key
            ? theme.palette.sky.text
            : theme.palette.slate.textSecondary
        }
        weight={effectiveActiveKey === style.key ? 'fill' : 'bold'}
      />
    ),
  }))

  return (
    <MapOptionSelector
      activeKey={effectiveActiveKey}
      activeIcon={<activeStyle.Icon size={21} color={theme.palette.sky.text} weight="fill" />}
      activeColor={theme.palette.sky.text}
      activeBackground={`${theme.palette.sky.color}1f`}
      collapsedAccessibilityLabel={`Basemap: ${activeStyle.label}`}
      expanded={expanded}
      options={options}
      onToggle={onToggle}
      onSelect={onSelect}
    />
  )
}
