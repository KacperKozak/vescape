import {
  ArrowUpIcon,
  ArrowsClockwiseIcon,
  DeviceMobileIcon,
  NavigationArrowIcon,
} from 'phosphor-react-native'
import { type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated'

import {
  MapOptionSelector,
  type MapOptionSelectorSize,
} from '@/components/ui/controls/MapOptionSelector'
import { MAP_NAVIGATION_MODES, type MapNavigationMode } from '@/constants/mapStyles'
import { theme } from '@/constants/theme'

const COLLAPSED_ICON_COLOR = theme.palette.mono.white

interface MapNavigationSelectorProps {
  activeMode: MapNavigationMode
  heading: SharedValue<number>
  expanded: boolean
  size?: MapOptionSelectorSize
  onToggle: () => void
  onSelect: (mode: MapNavigationMode) => void
}

export function MapNavigationSelector({
  activeMode,
  heading,
  expanded,
  size = 'md',
  onToggle,
  onSelect,
}: MapNavigationSelectorProps) {
  const iconSize = size === 'sm' ? 18 : 21
  const optionIconSize = size === 'sm' ? 17 : 20
  const freeRotateIconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-heading.value}deg` }],
  }))
  const options: { key: MapNavigationMode; label: string; icon: ReactNode }[] =
    MAP_NAVIGATION_MODES.map((option) => ({
      ...option,
      icon: getNavigationIcon(option.key, activeMode, optionIconSize),
    }))
  const activeIcon =
    activeMode === 'northUp' ? (
      <NorthAwareIcon heading={heading}>
        <ArrowUpIcon size={iconSize} color={COLLAPSED_ICON_COLOR} weight="bold" />
      </NorthAwareIcon>
    ) : activeMode === 'gpsHeading' ? (
      <NorthAwareIcon heading={heading} rotateNorthDot>
        <ForwardNavigationIcon size={iconSize} color={COLLAPSED_ICON_COLOR} />
      </NorthAwareIcon>
    ) : activeMode === 'phoneHeading' ? (
      <NorthAwareIcon heading={heading} rotateNorthDot>
        <DeviceMobileIcon size={iconSize} color={COLLAPSED_ICON_COLOR} weight="bold" />
      </NorthAwareIcon>
    ) : (
      <Animated.View style={freeRotateIconStyle}>
        <ArrowUpIcon size={iconSize} color={COLLAPSED_ICON_COLOR} weight="bold" />
      </Animated.View>
    )

  return (
    <MapOptionSelector
      activeKey={activeMode}
      activeIcon={activeIcon}
      activeColor={theme.palette.green.text}
      activeBackground={`${theme.palette.green.color}1f`}
      collapsedAccessibilityLabel={`Navigation: ${activeMode === 'northUp' ? 'North up' : activeMode === 'gpsHeading' ? 'GPS heading' : activeMode === 'phoneHeading' ? 'Compass' : 'Free rotate'}`}
      expanded={expanded}
      size={size}
      options={options}
      onToggle={onToggle}
      onSelect={onSelect}
    />
  )
}

function getNavigationIcon(
  mode: MapNavigationMode,
  activeMode: MapNavigationMode,
  iconSize: number,
) {
  const color = activeMode === mode ? theme.palette.green.text : theme.palette.slate.textSecondary
  if (mode === 'northUp') {
    return <ArrowUpIcon size={iconSize} color={color} weight="bold" />
  }
  if (mode === 'gpsHeading') {
    return <ForwardNavigationIcon size={iconSize} color={color} />
  }
  if (mode === 'phoneHeading') {
    return <DeviceMobileIcon size={iconSize} color={color} weight="bold" />
  }
  return <ArrowsClockwiseIcon size={iconSize} color={color} weight="bold" />
}

interface NorthAwareIconProps {
  children: ReactNode
  heading: SharedValue<number>
  compact?: boolean
  rotateNorthDot?: boolean
}

function NorthAwareIcon({
  children,
  heading,
  compact = false,
  rotateNorthDot = false,
}: NorthAwareIconProps) {
  const headingRotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-heading.value}deg` }],
  }))
  return (
    <Animated.View style={styles.northAwareIcon}>
      <Animated.View style={[styles.northDotOrbit, rotateNorthDot && headingRotationStyle]}>
        <View style={[styles.northDot, compact && styles.northDotCompact]} />
      </Animated.View>
      {children}
    </Animated.View>
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  northDotOrbit: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
  },
  northDot: {
    position: 'absolute',
    top: 0,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.status.error.color,
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
