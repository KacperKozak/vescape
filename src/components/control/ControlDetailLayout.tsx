import { useNavigation } from 'expo-router'
import { type ReactNode, useEffect } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

interface Props {
  title: string
  children: ReactNode
}

export function ControlDetailLayout({ title, children }: Props) {
  const navigation = useNavigation()
  useEffect(() => {
    navigation.setOptions({ title })
  }, [title, navigation])

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {children}
      <View style={styles.alertsSection}>
        <Text style={styles.sectionLabel}>ALERTS</Text>
        <Text style={styles.placeholder}>Alert configuration coming soon.</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  alertsSection: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  sectionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  placeholder: {
    color: '#475569',
    fontSize: 14,
  },
})
