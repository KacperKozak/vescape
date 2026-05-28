import { StyleSheet, Text, View } from 'react-native'
import { InfoIcon, WarningIcon, WarningCircleIcon } from 'phosphor-react-native'

import { theme } from '@/constants/theme'

type Variant = 'info' | 'warning' | 'error'

interface BannerProps {
  variant?: Variant
  title?: string
  message: string
}

const config = {
  info: {
    bg: theme.wheel.bg,
    border: theme.wheel.border,
    titleColor: theme.neutral.textPrimary,
    messageColor: theme.wheel.text,
    Icon: InfoIcon,
    iconColor: theme.wheel.color,
  },
  warning: {
    bg: theme.warning.bg,
    border: theme.warning.border,
    titleColor: theme.warning.text,
    messageColor: theme.highlight.color,
    Icon: WarningIcon,
    iconColor: theme.highlight.color,
  },
  error: {
    bg: theme.error.bg,
    border: theme.error.border,
    titleColor: theme.error.text,
    messageColor: theme.error.color,
    Icon: WarningCircleIcon,
    iconColor: theme.error.text,
  },
} satisfies Record<Variant, object>

export function Banner({ variant = 'info', title, message }: BannerProps) {
  const { bg, border, titleColor, messageColor, Icon, iconColor } = config[variant]

  return (
    <View style={[styles.container, { backgroundColor: bg, borderColor: border }]}>
      <Icon size={16} color={iconColor} weight="fill" style={styles.icon} />
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: titleColor }]}>{title}</Text> : null}
        <Text style={[styles.message, { color: messageColor }]}>{message}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  icon: {
    marginTop: 1,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
  },
  message: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
})
