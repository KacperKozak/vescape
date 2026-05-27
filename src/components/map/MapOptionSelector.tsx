import { type ReactNode } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'

interface MapOption<Key extends string> {
  key: Key
  label: string
  icon: ReactNode
}

interface MapOptionSelectorProps<Key extends string> {
  activeKey: Key
  activeIcon: ReactNode
  activeColor: string
  activeBackground: string
  collapsedAccessibilityLabel: string
  expanded: boolean
  options: MapOption<Key>[]
  onToggle: () => void
  onSelect: (key: Key) => void
}

const COLLAPSED_WIDTH = 50
const OPTION_WIDTH = 46
const ACTIVE_WIDTH = 126
const ANIMATION = { duration: 180 } as const

export function MapOptionSelector<Key extends string>({
  activeKey,
  activeIcon,
  activeColor,
  activeBackground,
  collapsedAccessibilityLabel,
  expanded,
  options,
  onToggle,
  onSelect,
}: MapOptionSelectorProps<Key>) {
  const shellStyle = useAnimatedStyle(
    () => ({
      width: withTiming(
        expanded ? ACTIVE_WIDTH + OPTION_WIDTH * (options.length - 1) + 2 : COLLAPSED_WIDTH,
        ANIMATION,
      ),
    }),
    [expanded, options.length],
  )
  const optionsStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(expanded ? 1 : 0, { duration: expanded ? 120 : 80 }),
    }),
    [expanded],
  )
  const collapsedStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(expanded ? 0 : 1, { duration: expanded ? 70 : 120 }),
    }),
    [expanded],
  )

  return (
    <Animated.View style={[styles.container, shellStyle]}>
      <Animated.View
        pointerEvents={expanded ? 'auto' : 'none'}
        accessibilityElementsHidden={!expanded}
        importantForAccessibility={expanded ? 'yes' : 'no-hide-descendants'}
        style={[styles.options, optionsStyle]}
      >
        {options.map((option) => (
          <MapOptionButton
            key={option.key}
            label={option.label}
            icon={option.icon}
            selected={activeKey === option.key}
            expanded={expanded}
            activeColor={activeColor}
            activeBackground={activeBackground}
            onPress={() => {
              if (activeKey !== option.key) onSelect(option.key)
            }}
          />
        ))}
      </Animated.View>
      <Animated.View
        pointerEvents={expanded ? 'none' : 'auto'}
        accessibilityElementsHidden={expanded}
        importantForAccessibility={expanded ? 'no-hide-descendants' : 'yes'}
        style={[styles.collapsed, collapsedStyle]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsedAccessibilityLabel}
          accessibilityState={{ expanded }}
          style={styles.collapsedButton}
          onPress={onToggle}
        >
          {activeIcon}
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

function MapOptionButton({
  label,
  icon,
  selected,
  expanded,
  activeColor,
  activeBackground,
  onPress,
}: {
  label: string
  icon: ReactNode
  selected: boolean
  expanded: boolean
  activeColor: string
  activeBackground: string
  onPress: () => void
}) {
  const style = useAnimatedStyle(
    () => ({
      width: withTiming(expanded && selected ? ACTIVE_WIDTH : OPTION_WIDTH, ANIMATION),
      backgroundColor: withTiming(
        expanded && selected ? activeBackground : 'rgba(0,0,0,0)',
        ANIMATION,
      ),
    }),
    [activeBackground, expanded, selected],
  )
  const labelStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(expanded && selected ? 1 : 0, ANIMATION),
      maxWidth: withTiming(expanded && selected ? ACTIVE_WIDTH : 0, ANIMATION),
      marginLeft: withTiming(expanded && selected ? 8 : 0, ANIMATION),
    }),
    [expanded, selected],
  )

  return (
    <Animated.View style={[styles.option, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={styles.optionPressable}
        onPress={onPress}
      >
        {icon}
        <Animated.Text
          numberOfLines={1}
          style={[styles.selectedLabel, { color: activeColor }, labelStyle]}
        >
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    height: 50,
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
  },
  options: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapsed: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsedButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
  },
  option: {
    height: 46,
    borderRadius: 23,
    overflow: 'hidden',
  },
  optionPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  selectedLabel: {
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '600',
  },
})
