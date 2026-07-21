import { type ReactNode } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { theme } from '@/constants/theme'

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
  size?: MapOptionSelectorSize
  options: MapOption<Key>[]
  onToggle: () => void
  onSelect: (key: Key) => void
}

export type MapOptionSelectorSize = keyof typeof SELECTOR_METRICS

const SELECTOR_METRICS = {
  sm: {
    height: 38,
    collapsedWidth: 38,
    collapsedButton: 36,
    optionWidth: 36,
    optionHeight: 34,
    activeWidth: 112,
    radius: 19,
    optionRadius: 17,
    labelFontSize: 12,
    labelMarginLeft: 7,
    paddingHorizontal: 10,
  },
  md: {
    height: 50,
    collapsedWidth: 50,
    collapsedButton: 48,
    optionWidth: 46,
    optionHeight: 46,
    activeWidth: 126,
    radius: 25,
    optionRadius: 23,
    labelFontSize: 13,
    labelMarginLeft: 8,
    paddingHorizontal: 12,
  },
} as const
const ANIMATION = { duration: 180 } as const

export function MapOptionSelector<Key extends string>({
  activeKey,
  activeIcon,
  activeColor,
  activeBackground,
  collapsedAccessibilityLabel,
  expanded,
  size = 'md',
  options,
  onToggle,
  onSelect,
}: MapOptionSelectorProps<Key>) {
  const metrics = SELECTOR_METRICS[size]
  const optionCount = options.length
  const shellStyle = useAnimatedStyle(
    () => ({
      width: withTiming(
        expanded
          ? metrics.activeWidth + metrics.optionWidth * (optionCount - 1) + 2
          : metrics.collapsedWidth,
        ANIMATION,
      ),
    }),
    [expanded, metrics.activeWidth, metrics.collapsedWidth, metrics.optionWidth, optionCount],
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
    <Animated.View
      style={[
        styles.container,
        { height: metrics.height, borderRadius: metrics.radius },
        shellStyle,
      ]}
    >
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
            metrics={metrics}
            onPress={() => {
              if (activeKey === option.key) {
                onToggle()
                return
              }
              onSelect(option.key)
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
          style={[
            styles.collapsedButton,
            {
              width: metrics.collapsedButton,
              height: metrics.collapsedButton,
              borderRadius: metrics.collapsedButton / 2,
            },
          ]}
          onPress={onToggle}
        >
          {activeIcon}
        </Pressable>
      </Animated.View>
    </Animated.View>
  )
}

interface MapOptionButtonProps {
  label: string
  icon: ReactNode
  selected: boolean
  expanded: boolean
  activeColor: string
  activeBackground: string
  metrics: (typeof SELECTOR_METRICS)[MapOptionSelectorSize]
  onPress: () => void
}

function MapOptionButton({
  label,
  icon,
  selected,
  expanded,
  activeColor,
  activeBackground,
  metrics,
  onPress,
}: MapOptionButtonProps) {
  const style = useAnimatedStyle(
    () => ({
      width: withTiming(
        expanded && selected ? metrics.activeWidth : metrics.optionWidth,
        ANIMATION,
      ),
      backgroundColor: withTiming(
        expanded && selected ? activeBackground : theme.alpha(theme.palette.mono.black, 0),
        ANIMATION,
      ),
    }),
    [activeBackground, expanded, metrics.activeWidth, metrics.optionWidth, selected],
  )
  const labelStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(expanded && selected ? 1 : 0, ANIMATION),
      maxWidth: withTiming(expanded && selected ? metrics.activeWidth : 0, ANIMATION),
      marginLeft: withTiming(expanded && selected ? metrics.labelMarginLeft : 0, ANIMATION),
    }),
    [expanded, metrics.activeWidth, metrics.labelMarginLeft, selected],
  )

  return (
    <Animated.View
      style={[
        styles.option,
        { height: metrics.optionHeight, borderRadius: metrics.optionRadius },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
        style={[styles.optionPressable, { paddingHorizontal: metrics.paddingHorizontal }]}
        onPress={onPress}
      >
        {icon}
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.selectedLabel,
            { color: activeColor, fontSize: metrics.labelFontSize },
            labelStyle,
          ]}
        >
          {label}
        </Animated.Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: theme.alpha(theme.palette.slate.surfaceDeep, 0.85),
    borderWidth: 1,
    borderColor: theme.alpha(theme.palette.slate.light, 0.3),
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
    fontFamily: theme.font('600'),
  },
})
