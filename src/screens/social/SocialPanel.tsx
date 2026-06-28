import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { NearbyRidesSection } from '@/screens/social/NearbyRidesSection'
import { RideStatsSection } from '@/screens/social/RideStatsSection'
import { RiderRosterSection } from '@/screens/social/RiderRosterSection'
import { RiderNameField } from '@/screens/social/RiderNameField'
import { theme } from '@/constants/theme'

export function SocialPanel() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <RiderNameField />

        <NearbyRidesSection />
        <RiderRosterSection />

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
