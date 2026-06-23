import { View, Text, Switch, StyleSheet, ScrollView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import {
  ClockCountdownIcon,
  BluetoothConnectedIcon,
  RecordIcon,
  CodeIcon,
  DatabaseIcon,
  InfoIcon,
  TagIcon,
  AndroidLogoIcon,
  AppleLogoIcon,
  MapPinIcon,
  FadersIcon,
  ChartLineUpIcon,
  GearSixIcon,
  WaveformIcon,
  SpeakerHighIcon,
  GaugeIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { routes } from '@/navigation/routes'
import { useSettingsStore } from '@/store/settingsStore'
import { theme } from '@/constants/theme'
import { formatBytes } from '@/helpers/format'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { Stepper } from '@/components/ui/forms/Stepper'
import { IconHero } from '@/components/ui/settings/IconHero'
import { useSettingsDatabaseOps } from '@/hooks/useSettingsDatabaseOps'

const appVersion = Constants.expoConfig?.version ?? '–'

export default function SettingsScreen() {
  const {
    liveHistoryLimit,
    socEstimateWindowSeconds,
    telemetryPollRateHz,
    autoConnect,
    autoRecording,
    connectionSoundsEnabled,
    set,
  } = useSettingsStore(
    useShallow((s) => ({
      liveHistoryLimit: s.liveHistoryLimit,
      socEstimateWindowSeconds: s.socEstimateWindowSeconds,
      telemetryPollRateHz: s.telemetryPollRateHz,
      autoConnect: s.autoConnect,
      autoRecording: s.autoRecording,
      connectionSoundsEnabled: s.connectionSoundsEnabled,
      set: s.set,
    })),
  )

  const db = useSettingsDatabaseOps()

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={GearSixIcon}
          description="These settings apply across the entire app and persist between rides."
        >
          <View style={styles.headerStats}>
            <View style={styles.headerItem}>
              <TagIcon size={14} color={theme.wheel.color} weight="duotone" />
              <Text style={styles.headerValue}>v{appVersion}</Text>
            </View>
            <View style={styles.headerItem}>
              {Platform.OS === 'ios' ? (
                <AppleLogoIcon size={14} color={theme.target.color} weight="duotone" />
              ) : (
                <AndroidLogoIcon size={14} color={theme.gps.color} weight="duotone" />
              )}
              <Text style={styles.headerValue}>
                {Platform.OS === 'ios' ? 'iOS' : 'Android'} {Platform.Version}
              </Text>
            </View>
            <View style={styles.headerItem}>
              <DatabaseIcon size={14} color={theme.warning.color} weight="duotone" />
              <Text style={styles.headerValue}>
                {db.dbSize != null ? formatBytes(db.dbSize) : '–'}
              </Text>
            </View>
          </View>
        </IconHero>

        <SettingsSectionTitle>General</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={ClockCountdownIcon}
            iconColor={theme.wheel.color}
            label="Live history limit"
            hint="Minutes of telemetry visible in live graphs"
            right={
              <Stepper
                value={liveHistoryLimit}
                min={1}
                max={50}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(50, Math.max(1, nextValue))
                  if (clampedValue !== liveHistoryLimit) {
                    void set('liveHistoryLimit', clampedValue)
                  }
                }}
              />
            }
          />
          <SettingsRow
            icon={GaugeIcon}
            iconColor={theme.gps.color}
            label="Telemetry rate limit"
            hint="Caps telemetry requests per second. 0 = unlimited"
            right={
              <Stepper
                value={telemetryPollRateHz}
                unit="Hz"
                min={0}
                max={100}
                step={(v, dir) => (dir === 1 ? (v < 5 ? 1 : 5) : v <= 5 ? 1 : 5)}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(100, Math.max(0, nextValue))
                  if (clampedValue !== telemetryPollRateHz) {
                    void set('telemetryPollRateHz', clampedValue)
                  }
                }}
              />
            }
          />
          <SettingsRow
            icon={WaveformIcon}
            iconColor={theme.target.color}
            label="Battery smoothing"
            hint="Median window steadies battery % for display and alerts. 0 = off"
            right={
              <Stepper
                value={socEstimateWindowSeconds}
                unit="s"
                min={0}
                max={120}
                step={5}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(120, Math.max(0, nextValue))
                  if (clampedValue !== socEstimateWindowSeconds) {
                    void set('socEstimateWindowSeconds', clampedValue)
                  }
                }}
              />
            }
          />
          <SettingsRow
            icon={BluetoothConnectedIcon}
            iconColor={theme.bran.color}
            label="Auto connect"
            hint="Connect to board on app start"
            right={
              <Switch
                value={autoConnect}
                onValueChange={(v) => void set('autoConnect', v)}
                trackColor={{ false: theme.neutral.border, true: theme.wheel.border }}
                thumbColor={autoConnect ? theme.wheel.color : theme.neutral.textMuted}
              />
            }
          />
          <SettingsRow
            icon={RecordIcon}
            iconWeight="fill"
            iconColor={theme.error.color}
            label="Auto recording"
            hint="Start recording when board connects"
            right={
              <Switch
                value={autoRecording}
                onValueChange={(v) => void set('autoRecording', v)}
                trackColor={{ false: theme.neutral.border, true: theme.wheel.border }}
                thumbColor={autoRecording ? theme.wheel.color : theme.neutral.textMuted}
              />
            }
          />
          <SettingsRow
            icon={SpeakerHighIcon}
            iconColor={theme.teal.color}
            label="Connection sounds"
            hint="Play on/off sounds on connect and dropout"
            right={
              <Switch
                value={connectionSoundsEnabled}
                onValueChange={(v) => void set('connectionSoundsEnabled', v)}
                trackColor={{ false: theme.neutral.border, true: theme.wheel.border }}
                thumbColor={connectionSoundsEnabled ? theme.wheel.color : theme.neutral.textMuted}
              />
            }
          />
        </SettingsCard>

        <SettingsSectionTitle>Recording</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={MapPinIcon}
            iconColor={theme.gps.color}
            label="Privacy zones"
            hint="Skip recording near saved places"
            onPress={() => router.push(routes.settingsPrivacyZones)}
          />
          <SettingsRow
            icon={FadersIcon}
            iconColor={theme.target.color}
            label="Filters"
            hint="Ride data filtering and free-spin detection"
            onPress={() => router.push(routes.settingsFilters)}
          />
          <SettingsRow
            icon={ChartLineUpIcon}
            iconColor={theme.teal.color}
            label="Graphs"
            hint="Hot gradients and color ramps"
            onPress={() => router.push(routes.settingsGraphs)}
          />
        </SettingsCard>

        <SettingsSectionTitle>Developer</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={CodeIcon}
            iconColor={theme.highlight.color}
            label="Dev tools"
            hint="Diagnostics and local verification"
            onPress={() => router.push(routes.settingsDev)}
          />
          <SettingsRow
            icon={DatabaseIcon}
            iconColor={theme.warning.color}
            label="Database"
            hint="Back up, restore, and rebuild history"
            onPress={() => router.push(routes.settingsDatabase)}
          />
          <SettingsRow
            icon={InfoIcon}
            iconColor={theme.teal.color}
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
    backgroundColor: theme.neutral.bg,
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
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
})
