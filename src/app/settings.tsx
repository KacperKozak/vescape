import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import {
  BluetoothConnectedIcon,
  CodeIcon,
  DatabaseIcon,
  InfoIcon,
  TagIcon,
  AndroidLogoIcon,
  AppleLogoIcon,
  MapPinIcon,
  FadersIcon,
  ChartLineUpIcon,
  GaugeIcon,
} from 'phosphor-react-native'

import { routes } from '@/navigation/routes'
import { theme } from '@/constants/theme'
import { formatBytes } from '@/helpers/format'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { IconHero } from '@/components/ui/settings/IconHero'
import { VescapeWordmark } from '@/components/ui/base/VescapeWordmark'
import { useSettingsDatabaseOps } from '@/hooks/useSettingsDatabaseOps'

const appVersion = Constants.expoConfig?.version ?? '–'

export default function SettingsScreen() {
  const db = useSettingsDatabaseOps()

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero media={<VescapeWordmark width={200} />}>
          <View style={styles.headerStats}>
            <View style={styles.headerItem}>
              <TagIcon size={14} color={theme.palette.sky.color} weight="duotone" />
              <Text style={styles.headerValue}>v{appVersion}</Text>
            </View>
            <View style={styles.headerItem}>
              {Platform.OS === 'ios' ? (
                <AppleLogoIcon size={14} color={theme.palette.purple.color} weight="duotone" />
              ) : (
                <AndroidLogoIcon size={14} color={theme.palette.green.color} weight="duotone" />
              )}
              <Text style={styles.headerValue}>
                {Platform.OS === 'ios' ? 'iOS' : 'Android'} {Platform.Version}
              </Text>
            </View>
            <View style={styles.headerItem}>
              <DatabaseIcon size={14} color={theme.status.warning.color} weight="duotone" />
              <Text style={styles.headerValue}>
                {db.dbSize != null ? formatBytes(db.dbSize) : '–'}
              </Text>
            </View>
          </View>
        </IconHero>

        <SettingsSectionTitle>General</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={BluetoothConnectedIcon}
            iconColor={theme.palette.cyan.color}
            label="Connection"
            hint="Auto start, auto connect, and sounds"
            onPress={() => router.push(routes.settingsConnection)}
          />
          <SettingsRow
            icon={GaugeIcon}
            iconColor={theme.palette.green.color}
            label="Live telemetry"
            hint="Graphs, update rate, and battery smoothing"
            onPress={() => router.push(routes.settingsLiveTelemetry)}
          />
        </SettingsCard>

        <SettingsSectionTitle>Recording</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={MapPinIcon}
            iconColor={theme.palette.green.color}
            label="Privacy zones"
            hint="Skip recording near saved places"
            onPress={() => router.push(routes.settingsPrivacyZones)}
          />
          <SettingsRow
            icon={FadersIcon}
            iconColor={theme.palette.purple.color}
            label="Filters"
            hint="Ride data filtering and free-spin detection"
            onPress={() => router.push(routes.settingsFilters)}
          />
          <SettingsRow
            icon={ChartLineUpIcon}
            iconColor={theme.palette.cyan.color}
            label="Graphs"
            hint="Hot gradients and color ramps"
            onPress={() => router.push(routes.settingsGraphs)}
          />
        </SettingsCard>

        <SettingsSectionTitle>Developer</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={CodeIcon}
            iconColor={theme.palette.yellow.color}
            label="Dev tools"
            hint="Diagnostics and local verification"
            onPress={() => router.push(routes.settingsDev)}
          />
          <SettingsRow
            icon={DatabaseIcon}
            iconColor={theme.status.warning.color}
            label="Database"
            hint="Back up, restore, and rebuild history"
            onPress={() => router.push(routes.settingsDatabase)}
          />
          <SettingsRow
            icon={InfoIcon}
            iconColor={theme.palette.cyan.color}
            label="About us"
            hint="The people who built this app"
            onPress={() => router.push(routes.settingsAbout)}
          />
        </SettingsCard>
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
  headerStats: {
    flexDirection: 'row',
    gap: 20,
  },
  headerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerValue: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
})
