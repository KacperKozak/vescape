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
    bg: theme.banner.info.bg,
    border: theme.banner.info.border,
    titleColor: theme.banner.info.title,
    messageColor: theme.banner.info.message,
    Icon: InfoIcon,
    iconColor: theme.banner.info.icon,
  },
  warning: {
    bg: theme.banner.warning.bg,
    border: theme.banner.warning.border,
    titleColor: theme.banner.warning.title,
    messageColor: theme.banner.warning.message,
    Icon: WarningIcon,
    iconColor: theme.banner.warning.icon,
  },
  error: {
    bg: theme.banner.error.bg,
    border: theme.banner.error.border,
    titleColor: theme.banner.error.title,
    messageColor: theme.banner.error.message,
    Icon: WarningCircleIcon,
    iconColor: theme.banner.error.icon,
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
    fontWeight: '700',
  },
  message: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
  },
})
