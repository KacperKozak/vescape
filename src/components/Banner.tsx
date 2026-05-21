import { StyleSheet, Text, View } from 'react-native'
import { InfoIcon, WarningIcon, WarningCircleIcon } from 'phosphor-react-native'

type Variant = 'info' | 'warning' | 'error'

interface BannerProps {
  variant?: Variant
  title?: string
  message: string
}

const config = {
  info: {
    bg: '#0c2a3f',
    border: '#0e4f72',
    titleColor: '#e0f2fe',
    messageColor: '#7dd3fc',
    Icon: InfoIcon,
    iconColor: '#38bdf8',
  },
  warning: {
    bg: '#2d1a00',
    border: '#854d0e',
    titleColor: '#fef3c7',
    messageColor: '#fcd34d',
    Icon: WarningIcon,
    iconColor: '#fbbf24',
  },
  error: {
    bg: '#3f1111',
    border: '#7f1d1d',
    titleColor: '#fecaca',
    messageColor: '#fca5a5',
    Icon: WarningCircleIcon,
    iconColor: '#f87171',
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
