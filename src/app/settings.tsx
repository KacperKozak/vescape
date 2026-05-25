import { useCallback, useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet, ScrollView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import {
  ClockCountdownIcon,
  BluetoothConnectedIcon,
  RecordIcon,
  GaugeIcon,
  CodeIcon,
  DatabaseIcon,
  TagIcon,
  AndroidLogoIcon,
  AppleLogoIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'
import { getDatabaseSizeBytes } from 'vesc-ble'

import { routes } from '@/navigation/routes'
import { useSettingsStore } from '@/store/settingsStore'
import { theme } from '@/constants/theme'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'
import { Stepper } from '@/components/settings/Stepper'

const appVersion = Constants.expoConfig?.version ?? '–'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SettingsScreen() {
  const { liveHistoryLimit, autoConnect, autoRecording, movingSpeedThresholdKmh, set } =
    useSettingsStore(
      useShallow((s) => ({
        liveHistoryLimit: s.liveHistoryLimit,
        autoConnect: s.autoConnect,
        autoRecording: s.autoRecording,
        movingSpeedThresholdKmh: s.movingSpeedThresholdKmh,
        set: s.set,
      })),
    )
  const [dbSize, setDbSize] = useState<number | null>(null)

  useEffect(() => {
    getDatabaseSizeBytes()
      .then(setDbSize)
      .catch(() => {})
  }, [])

  const decrementLimit = useCallback(() => {
    if (liveHistoryLimit > 1) void set('liveHistoryLimit', liveHistoryLimit - 1)
  }, [liveHistoryLimit, set])

  const incrementLimit = useCallback(() => {
    if (liveHistoryLimit < 50) void set('liveHistoryLimit', liveHistoryLimit + 1)
  }, [liveHistoryLimit, set])

  const decrementMovingSpeedThreshold = useCallback(() => {
    if (movingSpeedThresholdKmh > 0) {
      void set('movingSpeedThresholdKmh', movingSpeedThresholdKmh - 1)
    }
  }, [movingSpeedThresholdKmh, set])

  const incrementMovingSpeedThreshold = useCallback(() => {
    if (movingSpeedThresholdKmh < 20) {
      void set('movingSpeedThresholdKmh', movingSpeedThresholdKmh + 1)
    }
  }, [movingSpeedThresholdKmh, set])

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>Vibe Wheel</Text>
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
              <Text style={styles.headerValue}>{dbSize != null ? formatBytes(dbSize) : '–'}</Text>
            </View>
          </View>
        </View>

        <SettingsSectionTitle>General</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={ClockCountdownIcon}
            label="Live history limit"
            hint="Minutes of telemetry visible in live graphs"
            right={
              <Stepper
                value={liveHistoryLimit}
                onDecrement={decrementLimit}
                onIncrement={incrementLimit}
              />
            }
          />
          <SettingsRow
            icon={GaugeIcon}
            label="Moving speed threshold"
            hint="Speeds below this are ignored for avg speed. Only affects new rides."
            right={
              <Stepper
                value={`${movingSpeedThresholdKmh} km/h`}
                onDecrement={decrementMovingSpeedThreshold}
                onIncrement={incrementMovingSpeedThreshold}
              />
            }
          />
        </SettingsCard>

        <SettingsSectionTitle>Connection</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={BluetoothConnectedIcon}
            label="Auto connect"
            hint="Connect to board on app start"
            right={
              <Switch
                value={autoConnect}
                onValueChange={(v) => void set('autoConnect', v)}
                trackColor={{ false: '#334155', true: '#1d4ed8' }}
                thumbColor={autoConnect ? '#3b82f6' : '#64748b'}
              />
            }
          />
          <SettingsRow
            icon={RecordIcon}
            iconWeight="fill"
            label="Auto recording"
            hint="Start recording when board connects"
            right={
              <Switch
                value={autoRecording}
                onValueChange={(v) => void set('autoRecording', v)}
                trackColor={{ false: '#334155', true: '#1d4ed8' }}
                thumbColor={autoRecording ? '#3b82f6' : '#64748b'}
              />
            }
          />
        </SettingsCard>

        <SettingsSectionTitle>Developer</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={CodeIcon}
            label="Dev tools"
            hint="Diagnostics and local verification"
            onPress={() => router.push(routes.settingsDev)}
          />
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
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  appName: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '700',
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
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
})
