import type { Icon } from 'phosphor-react-native'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { interaction, theme } from '@/constants/theme'

const SIZES = { sm: 38, lg: 54 } as const
const ICON_SIZES = { sm: 18, lg: 22 } as const

interface IconButtonProps {
  icon: Icon
  onPress: () => void
  size?: keyof typeof SIZES
  disabled?: boolean
  destructive?: boolean
  loading?: boolean
  style?: StyleProp<ViewStyle>
}

export function IconButton({
  icon: Icon,
  onPress,
  size = 'sm',
  disabled = false,
  destructive = false,
  loading = false,
  style,
}: IconButtonProps) {
  const isDisabled = disabled || loading
  const dim = SIZES[size]
  const iconSize = ICON_SIZES[size]
  const iconColor = destructive ? theme.error.text : theme.neutral.textSecondary
  const borderColor = destructive ? theme.error.border : theme.neutral.border

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        { width: dim, height: dim, borderRadius: dim / 2, borderColor },
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: interaction.pressedOpacity },
        style,
      ]}
      android_ripple={interaction.ripple}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        <Icon size={iconSize} color={iconColor} weight="bold" />
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.neutral.surfaceDeep,
    borderWidth: 1,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.35,
  },
})
