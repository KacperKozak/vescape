import { ArrowUpIcon, ArrowsClockwiseIcon } from 'phosphor-react-native'
import { type ReactNode } from 'react'
import { View } from 'react-native'

import { MapOptionSelector } from '@/components/map/MapOptionSelector'
import type { MapNavigationMode } from '@/constants/mapStyles'
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
  const options: { key: MapNavigationMode; label: string; icon: ReactNode }[] = [
    {
      key: 'northUp',
      label: 'North up',
      icon: (
        <ArrowUpIcon
          size={20}
          color={activeMode === 'northUp' ? theme.gps.text : '#94a3b8'}
          weight="bold"
        />
      ),
    },
    {
      key: 'freeRotate',
      label: 'Free rotate',
      icon: (
        <ArrowsClockwiseIcon
          size={20}
          color={activeMode === 'freeRotate' ? theme.gps.text : '#94a3b8'}
          weight="bold"
        />
      ),
    },
  ]
  const activeIcon =
    activeMode === 'northUp' ? (
      <ArrowUpIcon size={21} color={theme.gps.text} weight="bold" />
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
      collapsedAccessibilityLabel={`Navigation: ${activeMode === 'northUp' ? 'North up' : 'Free rotate'}`}
      expanded={expanded}
      options={options}
      onToggle={onToggle}
      onSelect={onSelect}
    />
  )
}
