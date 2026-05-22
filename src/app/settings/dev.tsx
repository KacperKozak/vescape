import { ScrollView, StyleSheet, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { ChartLineUpIcon, SpeakerHighIcon, SwatchesIcon, ToolboxIcon } from 'phosphor-react-native'

import { routes } from '@/navigation/routes'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'

const devPages = [
  {
    label: 'Components library',
    hint: 'Browse all UI components with live props',
    route: routes.settingsComponents,
    icon: SwatchesIcon,
  },
  {
    label: 'Sound Playground',
    hint: 'Preview alert presets and geiger simulation',
    route: routes.settingsSoundPlayground,
    icon: SpeakerHighIcon,
  },
  {
    label: 'Diagnostic',
    hint: 'PostHog status and manual diagnostic events',
    route: routes.settingsDiagnostic,
    icon: ChartLineUpIcon,
  },
  {
    label: 'Other',
    hint: 'Small platform probes and local experiments',
    route: routes.settingsOther,
    icon: ToolboxIcon,
  },
]

export default function DevSettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsSectionTitle>Dev tools</SettingsSectionTitle>

        <SettingsCard>
          {devPages.map((page) => (
            <SettingsRow
              key={page.label}
              icon={page.icon}
              label={page.label}
              hint={page.hint}
              onPress={() => router.push(page.route)}
            />
          ))}
        </SettingsCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  content: {
    padding: 16,
    gap: 8,
  },
})
