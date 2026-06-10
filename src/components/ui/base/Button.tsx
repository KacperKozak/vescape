import type { Icon } from 'phosphor-react-native'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { interaction, theme } from '@/constants/theme'

interface ButtonProps {
  label: string
  onPress: () => Promise<void> | void
  testID?: string
  accessibilityLabel?: string
  variant?: 'primary' | 'secondary' | 'destructive'
  size?: 'sm' | 'md'
  icon?: Icon
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export function Button({
  label,
  onPress,
  testID,
  accessibilityLabel,
  variant = 'primary',
  size = 'md',
  icon: IconComponent,
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        variantStyles[variant].button,
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: interaction.pressedOpacity },
        style,
      ]}
      android_ripple={interaction.ripple}
      onPress={() => void onPress()}
      disabled={isDisabled}
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles[variant].indicatorColor} />
      ) : (
        IconComponent && (
          <IconComponent
            size={size === 'sm' ? 13 : 15}
            color={variantStyles[variant].iconColor}
            weight="bold"
          />
        )
      )}
      <Text
        style={[
          styles.label,
          size === 'sm' ? styles.labelSm : styles.labelMd,
          variantStyles[variant].text,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const variantStyles = {
  primary: {
    button: { backgroundColor: theme.bran.border },
    text: { color: theme.neutral.textPrimary },
    iconColor: theme.neutral.textPrimary,
    indicatorColor: theme.neutral.textPrimary,
  },
  secondary: {
    button: {
      backgroundColor: theme.neutral.surface,
      borderWidth: 1,
      borderColor: theme.neutral.border,
    },
    text: { color: theme.neutral.textSecondary },
    iconColor: theme.neutral.textSecondary,
    indicatorColor: theme.neutral.textSecondary,
  },
  destructive: {
    button: { backgroundColor: theme.error.border },
    text: { color: theme.error.text },
    iconColor: theme.error.text,
    indicatorColor: theme.error.text,
  },
} as const

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    gap: 6,
    overflow: 'hidden',
  },
  md: {
    height: 40,
    paddingHorizontal: 16,
  },
  sm: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  disabled: {
    opacity: 0.4,
  },
  label: {
    fontWeight: '700',
  },
  labelMd: {
    fontSize: 13,
  },
  labelSm: {
    fontSize: 12,
  },
})
