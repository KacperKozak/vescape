import { Children, type ReactNode } from 'react'
import { StyleSheet, View } from 'react-native'

export type SettingsCardProps = {
  children: ReactNode
}

export function SettingsCard({ children }: SettingsCardProps) {
  const items = Children.toArray(children)

  return (
    <View style={styles.card}>
      {items.map((child, index) => (
        <View key={index}>
          {index > 0 ? <View style={styles.separator} /> : null}
          {child}
        </View>
      ))}
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
  separator: {
    height: 1,
    backgroundColor: '#334155',
    marginLeft: 58,
  },
})
