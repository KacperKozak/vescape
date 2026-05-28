import { StyleSheet, Text } from 'react-native'

interface Props {
  title: string
}

export function ScreenTitle({ title }: Props) {
  return <Text style={styles.title}>{title}</Text>
}

const styles = StyleSheet.create({
  title: {
    color: '#f9fafb',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
})
