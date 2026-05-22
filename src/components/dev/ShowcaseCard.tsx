import { StyleSheet, Text, View } from 'react-native'
import { theme } from '@/constants/theme'

interface ShowcaseCardProps {
  name: string
  children: React.ReactNode
  controls?: React.ReactNode
}

export function ShowcaseCard({ name, children, controls }: ShowcaseCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{name}</Text>
      <View style={styles.preview}>{children}</View>
      {controls ? <View style={styles.controls}>{controls}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  name: {
    color: theme.wheel.color,
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'monospace',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  preview: {
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  controls: {
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
})
