import { ArrowUpIcon, ArrowsClockwiseIcon, NavigationArrowIcon } from 'phosphor-react-native'
import { type ReactNode } from 'react'
import { View } from 'react-native'

import { MapOptionSelector } from '@/components/map/MapOptionSelector'
import { MAP_NAVIGATION_MODES, type MapNavigationMode } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'

interface MapNavigationSelectorProps {
  activeMode: MapNavigationMode
  heading: number
  expanded: boolean
  onToggle: () => void
  onSelect: (mode: MapNavigationMode) => void
}

export function MapNavigationSelector({
  activeMode,
  heading,
  expanded,
  onToggle,
  onSelect,
}: MapNavigationSelectorProps) {
  const options: { key: MapNavigationMode; label: string; icon: ReactNode }[] =
    MAP_NAVIGATION_MODES.map((option) => ({
      ...option,
      icon: getNavigationIcon(option.key, activeMode),
    }))
  const activeIcon =
    activeMode === 'northUp' ? (
      <ArrowUpIcon size={21} color={theme.gps.text} weight="bold" />
    ) : activeMode === 'gpsHeading' ? (
      <NavigationArrowIcon size={21} color={theme.gps.text} weight="fill" />
    ) : (
      <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
        <ArrowUpIcon size={21} color={theme.gps.text} weight="bold" />
      </View>
    )

  return (
    <MapOptionSelector
      activeKey={activeMode}
      activeIcon={activeIcon}
      activeColor={theme.gps.text}
      activeBackground={`${theme.gps.color}1f`}
      collapsedAccessibilityLabel={`Navigation: ${activeMode === 'northUp' ? 'North up' : activeMode === 'gpsHeading' ? 'GPS heading' : 'Free rotate'}`}
      expanded={expanded}
      options={options}
      onToggle={onToggle}
      onSelect={onSelect}
    />
  )
}

function getNavigationIcon(mode: MapNavigationMode, activeMode: MapNavigationMode) {
  const color = activeMode === mode ? theme.gps.text : theme.neutral.textSecondary
  if (mode === 'northUp') return <ArrowUpIcon size={20} color={color} weight="bold" />
  if (mode === 'gpsHeading') {
    return <NavigationArrowIcon size={20} color={color} weight="fill" />
  }
  return <ArrowsClockwiseIcon size={20} color={color} weight="bold" />
}
