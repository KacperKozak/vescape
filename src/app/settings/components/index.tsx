import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import {
  ChartLineUpIcon,
  ListIcon,
  MapTrifoldIcon,
  SwatchesIcon,
  ToolboxIcon,
  CloudMoonIcon,
  CubeIcon,
  GearSixIcon,
  SquaresFourIcon,
  StackIcon,
} from 'phosphor-react-native'

import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { IconHero } from '@/components/ui/settings/IconHero'
import { theme } from '@/constants/theme'

const sections = [
  {
    label: 'Base',
    hint: 'Buttons, banners, device rows, badges, and other everyday building blocks',
    route: '/settings/components/base',
    icon: CubeIcon,
  },
  {
    label: 'Charts',
    hint: 'Sparklines and gauges for showing telemetry over time',
    route: '/settings/components/charts',
    icon: ChartLineUpIcon,
  },
  {
    label: 'Forms',
    hint: 'Inputs, dropdowns, pickers, and steppers for entering data',
    route: '/settings/components/forms',
    icon: ListIcon,
  },
  {
    label: 'Modals',
    hint: 'Popups, confirmations, and sheets that float above the screen',
    route: '/settings/components/modals',
    icon: SquaresFourIcon,
  },
  {
    label: 'Controls',
    hint: 'Buttons and selectors for switching between options or views',
    route: '/settings/components/controls',
    icon: SwatchesIcon,
  },
  {
    label: 'Widgets',
    hint: 'Dashboard tiles for showing and editing live board data',
    route: '/settings/components/widgets',
    icon: StackIcon,
  },
  {
    label: 'Settings',
    hint: 'Cards and rows used to build settings screens',
    route: '/settings/components/settings',
    icon: GearSixIcon,
  },
  {
    label: 'Tune',
    hint: 'Dials, sliders, and grids for adjusting board tuning',
    route: '/settings/components/tune',
    icon: ToolboxIcon,
  },
  {
    label: 'Weather',
    hint: 'Icons and strips for showing weather conditions and forecasts',
    route: '/settings/components/weather',
    icon: CloudMoonIcon,
  },
  {
    label: 'Map',
    hint: 'Map pins, routes, riders, weather radar, buildings — all layers, live controls',
    route: '/settings/components/map',
    icon: MapTrifoldIcon,
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
