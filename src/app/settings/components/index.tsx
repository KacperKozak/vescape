import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  ChartLineUpIcon,
  ListIcon,
  SwatchesIcon,
  ToolboxIcon,
  CloudMoonIcon,
  CubeIcon,
  GearSixIcon,
  SquaresFourIcon,
} from 'phosphor-react-native'

import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { IconHero } from '@/components/ui/settings/IconHero'
import { theme } from '@/constants/theme'

const sections = [
  {
    label: 'Base',
    hint: 'Button, IconButton, Banner, DeviceRow, InfoBadge, StepTimeline, Placeholder, ScreenTitle',
    route: '/settings/components/base',
    icon: CubeIcon,
  },
  {
    label: 'Charts',
    hint: 'Sparkline, LinearGauge, SingleGauge, TelemetryLineChart',
    route: '/settings/components/charts',
    icon: ChartLineUpIcon,
  },
  {
    label: 'Forms',
    hint: 'Select, Dropdown, Stepper, SoundPicker',
    route: '/settings/components/forms',
    icon: ListIcon,
  },
  {
    label: 'Modals',
    hint: 'ConfirmModal, InfoModal, TextPromptModal',
    route: '/settings/components/modals',
    icon: SquaresFourIcon,
  },
  {
    label: 'Controls',
    hint: 'CircleButton, FloatingBar, HistoryNavigator, HPills, MapOptionSelector',
    route: '/settings/components/controls',
    icon: SwatchesIcon,
  },
  {
    label: 'Settings',
    hint: 'SettingsCard, SettingsRow, SectionTitle, Stepper',
    route: '/settings/components/settings',
    icon: GearSixIcon,
  },
  {
    label: 'Tune',
    hint: 'TuneDial, BasicSliderCell, TuneSyncBar, TuneGroupGrid',
    route: '/settings/components/tune',
    icon: ToolboxIcon,
  },
  {
    label: 'Weather',
    hint: 'WeatherIcon, WeatherStat, WeatherPill, WeatherHourlyStrip',
    route: '/settings/components/weather',
    icon: CloudMoonIcon,
  },
]

export default function ComponentsIndex() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={SwatchesIcon}
          description="Browse and preview all UI components with live controls."
        />
        <SettingsSectionTitle>Component groups</SettingsSectionTitle>
        <SettingsCard>
          {sections.map((s) => (
            <SettingsRow
              key={s.label}
              icon={s.icon}
              label={s.label}
              hint={s.hint}
              onPress={() => router.push(s.route as any)}
            />
          ))}
        </SettingsCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.palette.slate.bg },
  content: { padding: 16, gap: 8 },
})
