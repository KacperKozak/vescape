import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AccountSection } from '@/modules/profile/screens/AccountSection'
import { RideStatsSection } from '@/modules/profile/screens/RideStatsSection'
import { theme } from '@/constants/theme'

export function ProfilePanel() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AccountSection />
        <RideStatsSection />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
  },
  content: {
    padding: 16,
    gap: 20,
  },
})
