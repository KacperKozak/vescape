import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  ChartLineUpIcon,
  RecordIcon,
  CompassIcon,
  ListIcon,
  SpeakerHighIcon,
  SwatchesIcon,
  ToolboxIcon,
  CodeIcon,
} from 'phosphor-react-native'

import { routes } from '@/navigation/routes'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { IconHero } from '@/components/ui/settings/IconHero'
import { theme } from '@/constants/theme'

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
    label: 'Debug recordings',
    hint: 'Capture and export raw BLE sessions',
    route: routes.settingsDebugRecordings,
    icon: RecordIcon,
  },
  {
    label: 'Diagnostic',
    hint: 'PostHog status and manual events',
    route: routes.settingsDiagnostic,
    icon: ChartLineUpIcon,
  },
  {
    label: 'Navigation diagnostics',
    hint: 'Live map heading, GPS, and fallback evidence',
    route: routes.settingsNavigationDiagnostic,
    icon: CompassIcon,
  },
  {
    label: 'Event log',
    hint: 'Browse locally persisted diagnostic events',
    route: routes.settingsDiagnosticEvents,
    icon: ListIcon,
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
        <IconHero
          icon={CodeIcon}
          description="Diagnostics, local verification, and component previews."
        />
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
    backgroundColor: theme.neutral.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
})
