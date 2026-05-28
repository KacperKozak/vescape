import {
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  DeviceMobileIcon,
  NavigationArrowIcon,
} from 'phosphor-react-native'
import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

import { MapOptionSelector } from '@/components/ui/menus/MapOptionSelector'
import { MAP_NAVIGATION_MODES, type MapNavigationMode } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'

const COLLAPSED_ICON_COLOR = theme.neutral.textPrimary

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
      <NorthAwareIcon>
        <ArrowUpIcon size={21} color={COLLAPSED_ICON_COLOR} weight="bold" />
      </NorthAwareIcon>
    ) : activeMode === 'gpsHeading' ? (
      <NorthAwareIcon northRotationDeg={-heading}>
        <ForwardNavigationIcon size={21} color={COLLAPSED_ICON_COLOR} />
      </NorthAwareIcon>
    ) : activeMode === 'phoneHeading' ? (
      <NorthAwareIcon northRotationDeg={-heading}>
        <DeviceMobileIcon size={21} color={COLLAPSED_ICON_COLOR} weight="bold" />
      </NorthAwareIcon>
    ) : (
      <NorthAwareIcon style={{ transform: [{ rotate: `${-heading}deg` }] }}>
        <ArrowUpIcon size={21} color={COLLAPSED_ICON_COLOR} weight="bold" />
      </NorthAwareIcon>
    )

  return (
    <MapOptionSelector
      activeKey={activeMode}
      activeIcon={activeIcon}
      activeColor={theme.gps.text}
      activeBackground={`${theme.gps.color}1f`}
      collapsedAccessibilityLabel={`Navigation: ${activeMode === 'northUp' ? 'North up' : activeMode === 'gpsHeading' ? 'GPS heading' : activeMode === 'phoneHeading' ? 'Compass' : 'Free rotate'}`}
      expanded={expanded}
      options={options}
      onToggle={onToggle}
      onSelect={onSelect}
    />
  )
}

function getNavigationIcon(mode: MapNavigationMode, activeMode: MapNavigationMode) {
  const color = activeMode === mode ? theme.gps.text : theme.neutral.textSecondary
  if (mode === 'northUp') {
    return <ArrowUpIcon size={20} color={color} weight="bold" />
  }
  if (mode === 'gpsHeading') {
    return <ForwardNavigationIcon size={20} color={color} />
  }
  if (mode === 'phoneHeading') return <DeviceMobileIcon size={20} color={color} weight="bold" />
  return <ArrowsClockwiseIcon size={20} color={color} weight="bold" />
}

interface NorthAwareIconProps {
  children: ReactNode
  compact?: boolean
  northRotationDeg?: number
  style?: object
}

function NorthAwareIcon({
  children,
  compact = false,
  northRotationDeg = 0,
  style,
}: NorthAwareIconProps) {
  return (
    <View style={[styles.northAwareIcon, style]}>
      <View style={[styles.northDotOrbit, { transform: [{ rotate: `${northRotationDeg}deg` }] }]}>
        <View style={[styles.northDot, compact && styles.northDotCompact]} />
      </View>
      {children}
    </View>
  )
}

function ForwardNavigationIcon({ size, color }: { size: number; color: string }) {
  return (
    <View style={styles.forwardNavigationIcon}>
      <NavigationArrowIcon size={size} color={color} weight="fill" />
    </View>
  )
}

const styles = StyleSheet.create({
  northAwareIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  northDotOrbit: {
    position: 'absolute',
    width: 24,
    height: 24,
    alignItems: 'center',
  },
  northDot: {
    position: 'absolute',
    top: -8,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.error.color,
  },
  northDotCompact: {
    top: 1,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  forwardNavigationIcon: {
    transform: [{ rotate: '45deg' }],
  },
})
