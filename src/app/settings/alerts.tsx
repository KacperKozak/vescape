import { StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BellRingingIcon } from 'phosphor-react-native'

import { theme } from '@/constants/theme'
import { IconHero } from '@/components/settings/IconHero'
import { AlertPresetSetup } from '@/modules/alerts/components/AlertPresetSetup'

export default function AlertsSettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={BellRingingIcon}
          description="Set your Rider Top Speed and pick how loudly each metric warns you — Off, Safe, Normal, or Pro."
        />
        <AlertPresetSetup />
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
