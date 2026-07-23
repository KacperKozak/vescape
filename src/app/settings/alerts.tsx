import { StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BellRingingIcon } from 'phosphor-react-native'

import { theme } from '@/constants/theme'
import { IconHero } from '@/components/settings/IconHero'
import { RiderTopSpeedCard } from '@/modules/alerts/components/RiderTopSpeedCard'

export default function AlertsSettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero icon={BellRingingIcon} description="Adjust your alert settings." />
        <RiderTopSpeedCard />
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
    gap: 8,
  },
})
