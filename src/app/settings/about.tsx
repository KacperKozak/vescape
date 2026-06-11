import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CrownIcon, PaletteIcon, UsersIcon } from 'phosphor-react-native'

import { IconHero } from '@/components/ui/settings/IconHero'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { theme } from '@/constants/theme'

export default function AboutScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero icon={UsersIcon} description="The people who built this app." />
        <SettingsCard>
          <SettingsRow
            icon={CrownIcon}
            iconColor={theme.wheel.color}
            label="Kacper Kozak (Zwłoki)"
            hint="Founder & Author"
          />
          <SettingsRow
            icon={PaletteIcon}
            iconColor={theme.highlight.color}
            label="Bartosz Kozak (Kosak)"
            hint="UI Design & Frontend"
          />
        </SettingsCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
})
