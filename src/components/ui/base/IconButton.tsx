import { useEffect } from 'react'
import type { Icon } from 'phosphor-react-native'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { interaction, theme } from '@/constants/theme'

const SIZES = { sm: 38, md: 50, lg: 54 } as const
const ICON_SIZES = { sm: 18, md: 21, lg: 22 } as const

interface IconButtonProps {
  icon: Icon
  onPress: () => void
  onLongPress?: () => void
  size?: keyof typeof SIZES
  disabled?: boolean
  destructive?: boolean
  /** Override the icon + border colour to signal an active state. */
  accent?: string
  /** Show a small pulsing badge dot in this colour (e.g. nearby Group Rides). */
  dot?: string
  loading?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  accessibilityLabel?: string
}

export function IconButton({
  icon: Icon,
  onPress,
  onLongPress,
  size = 'sm',
  disabled = false,
  destructive = false,
  accent,
  dot,
  loading = false,
  style,
  testID,
  accessibilityLabel,
}: IconButtonProps) {
  const isDisabled = disabled || loading
  const dim = SIZES[size]
  const iconSize = ICON_SIZES[size]
  const iconColor = destructive
    ? theme.status.error.text
    : (accent ?? theme.palette.slate.textSecondary)
  const borderColor = destructive
    ? theme.status.error.border
    : (accent ?? theme.palette.slate.border)

  const pulse = useSharedValue(0)
  useEffect(() => {
    if (!dot) return
    pulse.value = 0
    pulse.value = withRepeat(
      withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    )
  }, [dot, pulse])
  const dotStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 0.85 + pulse.value * 0.35 }],
  }))

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2, borderColor },
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: interaction.pressedOpacity },
        style,
      ]}
      android_ripple={interaction.ripple}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <Icon size={iconSize} color={iconColor} weight="bold" />
      )}
      {dot && !loading ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.dot, { backgroundColor: dot }, dotStyle]}
        />
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
  },
  disabled: {
    opacity: 0.35,
  },
  dot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: theme.palette.slate.surfaceDeep,
  },
})
