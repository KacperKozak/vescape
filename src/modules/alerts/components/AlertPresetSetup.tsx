import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { SpeedometerIcon } from 'phosphor-react-native'

import { Text } from '@/components/base/Text'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { Stepper } from '@/components/forms/Stepper'
import { theme } from '@/constants/theme'
import { AlertPresetControl } from '@/modules/alerts/components/AlertPresetControl'
import {
  ALERT_PRESET_METRICS,
  normalizeAlertPresetSelection,
  type AlertPresetLevel,
  type AlertPresetMetric,
} from '@/modules/alerts/lib/alertPresets'
import { useAlertPresetStore } from '@/modules/alerts/store/alertPresetStore'
import { deriveBatteryConfig } from '@/modules/battery/lib'
import { useBoardStore } from '@/modules/board/store/boardStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

const RIDER_TOP_SPEED_MIN = 5
const RIDER_TOP_SPEED_MAX = 150

/**
 * The full per-metric Alert Preset setup: Rider Top Speed plus an
 * {@link AlertPresetControl} for every preset metric, each wired straight to the
 * Alert Preset store, settings, and the active board. Offline preview (no live
 * telemetry needle) so it works before a board session exists.
 *
 * Shared by the one-time add-board wizard step and the durable Alerts settings
 * entry — both host the identical setup, so the wiring lives here once.
 */
export function AlertPresetSetup() {
  const riderTopSpeedKmh = useSettingsStore((s) => s.riderTopSpeedKmh)
  const setSetting = useSettingsStore((s) => s.set)
  const alertPreset = useSettingsStore((s) => s.alertPreset)
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const selection = useMemo(() => normalizeAlertPresetSelection(alertPreset), [alertPreset])

  const hasBatteryConfig = useMemo(
    () => deriveBatteryConfig(board?.batteryConfig ?? null).warning == null,
    [board?.batteryConfig],
  )

  const setRiderTopSpeed = (next: number) => {
    const clamped = Math.min(RIDER_TOP_SPEED_MAX, Math.max(RIDER_TOP_SPEED_MIN, next))
    if (clamped === riderTopSpeedKmh) return
    void setSetting('riderTopSpeedKmh', clamped).then(() =>
      useAlertPresetStore.getState().regenerateSpeed(),
    )
  }

  const handleLevelChange = (metric: AlertPresetMetric, level: AlertPresetLevel) => {
    void useAlertPresetStore.getState().setLevel(metric, level)
  }

  return (
    <View style={styles.container}>
      <SettingsCard>
        <SettingsRow
          icon={SpeedometerIcon}
          iconColor={theme.palette.orange.color}
          label="Rider top speed"
          hint="Speed you consider yourself capable of. Scales the speed gauge and preset"
          right={
            <Stepper
              value={riderTopSpeedKmh}
              unit="km/h"
              min={RIDER_TOP_SPEED_MIN}
              max={RIDER_TOP_SPEED_MAX}
              step={5}
              onChange={setRiderTopSpeed}
            />
          }
        />
      </SettingsCard>

      {ALERT_PRESET_METRICS.map((metric) => {
        // Battery presets are SoC %-based — a hard block, not a prompt, without a valid battery config.
        const batteryBlocked = metric === 'battery' && !hasBatteryConfig
        return (
          <View key={metric} style={styles.metric}>
            <AlertPresetControl
              metric={metric}
              level={selection[metric]}
              onLevelChange={(level) => handleLevelChange(metric, level)}
              riderTopSpeedKmh={riderTopSpeedKmh}
              hasBatteryConfig={hasBatteryConfig}
              disabled={batteryBlocked}
            />
            {batteryBlocked ? (
              <Text style={styles.note}>
                Battery presets alert on state-of-charge % — set up this board&apos;s battery to
                enable them.
              </Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  metric: {
    gap: 8,
  },
  note: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
})
