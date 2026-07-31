import type { Icon } from 'phosphor-react-native'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { Text } from '@/components/base/Text'

import { interaction } from '@/constants/theme'
import { useResolvedAccentColors, useResolvedNeutralColors } from '@/hooks/useTheme'

interface ButtonProps {
  label: string
  onPress: () => Promise<void> | void
  testID?: string
  accessibilityLabel?: string
  variant?: 'primary' | 'accent' | 'tune' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  icon?: Icon
  iconPosition?: 'left' | 'right'
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
  iconPosition = 'left',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const accents = useResolvedAccentColors()
  const neutral = useResolvedNeutralColors()
  const variantStyles = {
    primary: {
      button: { backgroundColor: accents.cyan.solid },
      text: { color: accents.cyan.onSolid },
      iconColor: accents.cyan.onSolid,
      indicatorColor: accents.cyan.onSolid,
    },
    accent: {
      button: {
        backgroundColor: neutral.surface,
        borderWidth: 1,
        borderColor: accents.cyan.border,
      },
      text: { color: accents.cyan.text },
      iconColor: accents.cyan.text,
      indicatorColor: accents.cyan.text,
    },
    tune: {
      button: { backgroundColor: accents.purple.solid },
      text: { color: accents.purple.onSolid },
      iconColor: accents.purple.onSolid,
      indicatorColor: accents.purple.onSolid,
    },
    secondary: {
      button: {
        backgroundColor: neutral.surface,
        borderWidth: 1,
        borderColor: neutral.border,
      },
      text: { color: neutral.textSecondary },
      iconColor: neutral.textSecondary,
      indicatorColor: neutral.textSecondary,
    },
    destructive: {
      button: {
        backgroundColor: accents.red.bg,
        borderWidth: 1,
        borderColor: accents.red.border,
      },
      text: { color: accents.red.text },
      iconColor: accents.red.text,
      indicatorColor: accents.red.text,
    },
  } as const
  const isDisabled = disabled || loading
  const icon =
    IconComponent && !loading ? (
      <IconComponent
        size={size === 'sm' ? 13 : size === 'lg' ? 17 : 15}
        color={variantStyles[variant].iconColor}
        weight="bold"
      />
    ) : null

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : size === 'lg' ? styles.lg : styles.md,
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
      ) : iconPosition === 'left' ? (
        icon
      ) : null}
      <Text
        style={[
          styles.label,
          size === 'sm' ? styles.labelSm : size === 'lg' ? styles.labelLg : styles.labelMd,
          variantStyles[variant].text,
        ]}
      >
        {label}
      </Text>
      {!loading && iconPosition === 'right' ? icon : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    gap: 6,
    overflow: 'hidden',
  },
  md: {
    height: 40,
    paddingHorizontal: 16,
  },
  lg: {
    height: 48,
    paddingHorizontal: 20,
  },
  sm: {
    height: 32,
    paddingHorizontal: 12,
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
  labelLg: {
    fontSize: 14,
  },
  labelSm: {
    fontSize: 12,
  },
})
