import type { Icon } from 'phosphor-react-native'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

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
  loading?: boolean
  style?: StyleProp<ViewStyle>
}

export function IconButton({
  icon: Icon,
  onPress,
  onLongPress,
  size = 'sm',
  disabled = false,
  destructive = false,
  loading = false,
  style,
}: IconButtonProps) {
  const isDisabled = disabled || loading
  const dim = SIZES[size]
  const iconSize = ICON_SIZES[size]
  const iconColor = destructive ? theme.status.error.text : theme.palette.slate.textSecondary
  const borderColor = destructive ? theme.status.error.border : theme.palette.slate.border

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
      onLongPress={onLongPress}
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
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.35,
  },
})
