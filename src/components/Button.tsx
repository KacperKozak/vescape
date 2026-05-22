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
  onPress: () => void
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
      onPress={onPress}
      disabled={isDisabled}
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
    button: { backgroundColor: '#1d4ed8' },
    text: { color: '#f8fafc' },
    iconColor: '#f8fafc',
    indicatorColor: '#f8fafc',
  },
  secondary: {
    button: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#334155' },
    text: { color: '#cbd5e1' },
    iconColor: '#cbd5e1',
    indicatorColor: '#cbd5e1',
  },
  destructive: {
    button: { backgroundColor: theme.error.border },
    text: { color: '#fecaca' },
    iconColor: '#fecaca',
    indicatorColor: '#fecaca',
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
