import { StyleSheet, Text } from 'react-native'
import { theme } from '@/constants/theme'

interface Props {
  title: string
}

export function ScreenTitle({ title }: Props) {
  return <Text style={styles.title}>{title}</Text>
}

const styles = StyleSheet.create({
  title: {
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
})
