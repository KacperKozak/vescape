import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { AlertPresetControl } from '@/modules/alerts/components/AlertPresetControl'
import {
  normalizeAlertPresetSelection,
  type AlertPresetMetric,
} from '@/modules/alerts/lib/alertPresets'
import { useAlertPresetStore } from '@/modules/alerts/store/alertPresetStore'
import { deriveBatteryConfig } from '@/modules/battery/lib'
import { useBoardStore } from '@/modules/board/store/boardStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

/**
 * A single metric's Alert Preset control (labeled gauge preview + Off/Safe/Normal/Pro
 * slider), wired straight to the Alert Preset store, settings, and the active board.
 * Offline preview — no live telemetry needle — so it works before a board session exists.
 *
 * One metric per instance so the add-board wizard can page through them one at a time.
 */
export function AlertPresetMetricSetup({ metric }: { metric: AlertPresetMetric }) {
  const riderTopSpeedKmh = useSettingsStore((s) => s.riderTopSpeedKmh)
  const alertPreset = useSettingsStore((s) => s.alertPreset)
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const selection = useMemo(() => normalizeAlertPresetSelection(alertPreset), [alertPreset])
  const hasBatteryConfig = useMemo(
    () => deriveBatteryConfig(board?.batteryConfig ?? null).warning == null,
    [board?.batteryConfig],
  )

  // Battery presets are SoC %-based — a hard block, not a prompt, without a valid battery config.
  const batteryBlocked = metric === 'battery' && !hasBatteryConfig

  return (
    <View style={styles.metric}>
      <AlertPresetControl
        metric={metric}
        level={selection[metric]}
        onLevelChange={(level) => void useAlertPresetStore.getState().setLevel(metric, level)}
        riderTopSpeedKmh={riderTopSpeedKmh}
        hasBatteryConfig={hasBatteryConfig}
        disabled={batteryBlocked}
      />
      {batteryBlocked ? (
        <Text style={styles.note}>
          Battery presets alert on state-of-charge % — set up this board&apos;s battery to enable
          them.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
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
