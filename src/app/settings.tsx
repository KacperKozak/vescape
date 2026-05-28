import { View, Text, Switch, StyleSheet, ScrollView, Platform, Pressable } from 'react-native'
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
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  TagIcon,
  AndroidLogoIcon,
  AppleLogoIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  ArrowsOutLineHorizontalIcon,
  ProhibitIcon,
  MapPinIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { routes } from '@/navigation/routes'
import { useSettingsStore } from '@/store/settingsStore'
import { theme } from '@/constants/theme'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'
import { Stepper } from '@/components/settings/Stepper'
import { Button } from '@/components/Button'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useSettingsDatabaseOps } from '@/hooks/useSettingsDatabaseOps'

const appVersion = Constants.expoConfig?.version ?? '–'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SettingsScreen() {
  const {
    liveHistoryLimit,
    autoConnect,
    autoRecording,
    movingSpeedThresholdKmh,
    freeSpinMaxSpeedDeltaKmh,
    freeSpinStationaryBoardCapKmh,
    set,
  } = useSettingsStore(
    useShallow((s) => ({
      liveHistoryLimit: s.liveHistoryLimit,
      autoConnect: s.autoConnect,
      autoRecording: s.autoRecording,
      movingSpeedThresholdKmh: s.movingSpeedThresholdKmh,
      freeSpinMaxSpeedDeltaKmh: s.freeSpinMaxSpeedDeltaKmh,
      freeSpinStationaryBoardCapKmh: s.freeSpinStationaryBoardCapKmh,
      set: s.set,
    })),
  )

  const db = useSettingsDatabaseOps()

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
              <Text style={styles.headerValue}>
                {db.dbSize != null ? formatBytes(db.dbSize) : '–'}
              </Text>
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
            icon={BluetoothConnectedIcon}
            label="Auto connect"
            hint="Connect to board on app start"
            right={
              <Switch
                value={autoConnect}
                onValueChange={(v) => void set('autoConnect', v)}
                trackColor={{ false: theme.neutral.border, true: '#1d4ed8' }}
                thumbColor={autoConnect ? '#3b82f6' : theme.neutral.textMuted}
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
                trackColor={{ false: theme.neutral.border, true: '#1d4ed8' }}
                thumbColor={autoRecording ? '#3b82f6' : theme.neutral.textMuted}
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
        </SettingsCard>

        <SettingsSectionTitle>Stats</SettingsSectionTitle>
        <Text style={styles.sectionHint}>
          Changes apply to new rides only. Rebuild history to reprocess past rides.
        </Text>

        <SettingsCard>
          <SettingsRow
            icon={GaugeIcon}
            label="Moving speed threshold"
            hint={'Speeds below this are ignored for avg speed.\nDefault: 3 km/h.'}
            right={
              <Stepper
                value={movingSpeedThresholdKmh}
                unit="km/h"
                min={0}
                max={20}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(20, Math.max(0, nextValue))
                  if (clampedValue !== movingSpeedThresholdKmh) {
                    void set('movingSpeedThresholdKmh', clampedValue)
                  }
                }}
              />
            }
          />
          <SettingsRow
            icon={ArrowsOutLineHorizontalIcon}
            label="Free spin speed delta"
            hint={
              'Max board-vs-GPS speed gap before sample is excluded as free spin. Lower will increase the number of excluded samples.\nDefault: 12 km/h.'
            }
            right={
              <Stepper
                value={freeSpinMaxSpeedDeltaKmh}
                unit="km/h"
                min={1}
                max={60}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(60, Math.max(1, nextValue))
                  if (clampedValue !== freeSpinMaxSpeedDeltaKmh) {
                    void set('freeSpinMaxSpeedDeltaKmh', clampedValue)
                  }
                }}
              />
            }
          />
          <SettingsRow
            icon={ProhibitIcon}
            label="Free spin stationary cap"
            hint={
              'Max board speed allowed when GPS is nearly stationary. Lower will increase the number of excluded samples.\nDefault: 15 km/h.'
            }
            right={
              <Stepper
                value={freeSpinStationaryBoardCapKmh}
                unit="km/h"
                min={1}
                max={60}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(60, Math.max(1, nextValue))
                  if (clampedValue !== freeSpinStationaryBoardCapKmh) {
                    void set('freeSpinStationaryBoardCapKmh', clampedValue)
                  }
                }}
              />
            }
          />
        </SettingsCard>

        <SettingsSectionTitle>Database</SettingsSectionTitle>

        <SettingsCard>
          <SettingsRow
            icon={ClockCounterClockwiseIcon}
            label="Rebuild history"
            hint={db.rebuildHint}
            right={
              <Pressable
                style={[
                  styles.rebuildButton,
                  db.rebuildState === 'running' && styles.rebuildButtonDisabled,
                  db.rebuildState === 'done' && styles.rebuildButtonDone,
                ]}
                onPress={db.handleRebuildBuckets}
                disabled={db.rebuildState === 'running'}
              >
                {db.rebuildState === 'done' && (
                  <CheckCircleIcon size={13} color="#bbf7d0" weight="fill" />
                )}
                <Text style={styles.rebuildButtonText}>
                  {db.rebuildState === 'running'
                    ? 'Rebuilding...'
                    : db.rebuildState === 'done'
                      ? 'Done'
                      : 'Rebuild'}
                </Text>
              </Pressable>
            }
          >
            {db.rebuildState === 'running' && (
              <View style={styles.rebuildProgress}>
                <View style={styles.rebuildProgressTrack}>
                  <View
                    style={[
                      styles.rebuildProgressFill,
                      {
                        width: `${Math.round(db.rebuildProgressValue * 100)}%`,
                      },
                    ]}
                  />
                </View>
                {db.rebuildProgressLabel ? (
                  <Text style={styles.rebuildProgressText}>{db.rebuildProgressLabel}</Text>
                ) : null}
              </View>
            )}
          </SettingsRow>
          <SettingsRow
            icon={DownloadSimpleIcon}
            iconColor={theme.gps.color}
            label="Back up database"
            hint={db.backupHint}
            right={
              <Button
                label={db.backupState === 'running' ? 'Exporting...' : 'Export'}
                size="sm"
                variant="secondary"
                loading={db.backupState === 'running'}
                disabled={db.restoreState === 'running' || db.rebuildState === 'running'}
                onPress={db.handleBackupDatabase}
              />
            }
          />
          <SettingsRow
            icon={UploadSimpleIcon}
            iconColor={theme.warning.color}
            label="Restore database"
            hint={db.restoreHint}
            right={
              <Button
                label={db.restoreState === 'running' ? 'Restoring...' : 'Restore'}
                size="sm"
                variant="destructive"
                loading={db.restoreState === 'running'}
                disabled={db.backupState === 'running' || db.rebuildState === 'running'}
                onPress={() => db.setRestoreConfirmVisible(true)}
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
      <ConfirmModal
        visible={db.restoreConfirmVisible}
        title="Restore database"
        message="Current database will be replaced by selected backup. App keeps a temporary rollback copy during restore and restores old database if restore fails."
        confirmLabel="Choose backup"
        destructive
        onConfirm={() => void db.handleRestoreDatabase()}
        onCancel={() => db.setRestoreConfirmVisible(false)}
      />
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
  header: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  appName: {
    color: theme.neutral.textPrimary,
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
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHint: {
    color: theme.neutral.textDim,
    fontSize: 12,
    marginTop: -4,
    marginBottom: 4,
    marginLeft: 4,
  },
  rebuildButton: {
    backgroundColor: theme.neutral.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rebuildButtonDisabled: {
    opacity: 0.5,
  },
  rebuildButtonDone: {
    borderColor: '#166534',
    backgroundColor: '#052e16',
  },
  rebuildButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  rebuildProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 12,
  },
  rebuildProgressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: theme.neutral.surfaceDeep,
    borderRadius: 999,
    overflow: 'hidden',
  },
  rebuildProgressFill: {
    height: '100%',
    backgroundColor: theme.warning.color,
  },
  rebuildProgressText: {
    minWidth: 44,
    color: theme.neutral.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'right',
  },
})
