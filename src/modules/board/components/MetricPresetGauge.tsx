import { useCallback, useMemo } from 'react'
import { useRouter } from 'expo-router'
import { SpeedometerIcon } from 'phosphor-react-native'
import { StyleSheet, View } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'

import { Button } from '@/components/base/Button'
import { Text } from '@/components/base/Text'
import { type DualGaugeAlert } from '@/components/charts/gaugeAlert'
import { theme } from '@/constants/theme'
import { AlertPresetControl } from '@/modules/alerts/components/AlertPresetControl'
import {
  type AlertPresetLevel,
  type AlertPresetMetric,
  isPresetAlertRule,
  normalizeAlertPresetSelection,
} from '@/modules/alerts/lib/alertPresets'
import { useAlertPresetStore } from '@/modules/alerts/store/alertPresetStore'
import { useAlertsStore } from '@/modules/alerts/store/alertsStore'
import { deriveBatteryConfig } from '@/modules/battery/lib'
import {
  getHistoryMetricHotRange,
  getHistoryMetricKeyForControlId,
} from '@/modules/history/lib/metricColorScale'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import { useBoardStore } from '@/modules/board/store/boardStore'
import { routes } from '@/navigation/routes'

interface MetricPresetGaugeProps {
  /** Preset metric — equal to the telemetry/alert `controlId` for this detail view. */
  metric: AlertPresetMetric
  /** Live telemetry value driving the gauge needle + readout. */
  value: SharedValue<number | null>
}

/**
 * The detail-view preset block: an {@link AlertPresetControl} wired to the Alert
 * Preset store, settings, and the active board. It renders the enlarged live gauge
 * (preset markers + custom markers layered onto one arc) with the Off/Safe/Normal/Pro
 * slider, sitting above the custom `AlertsSection`. Board is the telemetry hub that
 * already reads the alerts/history/settings stores, so the store wiring lives here
 * rather than in each per-metric route.
 */
export function MetricPresetGauge({ metric, value }: MetricPresetGaugeProps) {
  const router = useRouter()
  const level = useSettingsStore((s) => normalizeAlertPresetSelection(s.alertPreset)[metric])
  const riderTopSpeedKmh = useSettingsStore((s) => s.riderTopSpeedKmh)
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const rules = useAlertsStore((s) => s.rules)
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const hasBatteryConfig = useMemo(
    () => deriveBatteryConfig(board?.batteryConfig ?? null).warning == null,
    [board?.batteryConfig],
  )

  const hotMetric = getHistoryMetricKeyForControlId(metric)
  const hotRange = hotMetric
    ? getHistoryMetricHotRange(hotMetric, hotRanges, gradientsEnabled)
    : null

  // Every enabled non-preset rule (custom + legal-mode) drawn as a marker, matching the markers the
  // old detail gauge showed. Preset rules are excluded here — they render from the generator instead.
  const customAlerts = useMemo<DualGaugeAlert[]>(
    () =>
      rules
        .filter((rule) => rule.controlId === metric && rule.enabled && !isPresetAlertRule(rule))
        .map((rule) => ({
          id: rule.id,
          threshold: rule.threshold,
          thresholdMax: rule.thresholdMax,
        })),
    [rules, metric],
  )

  const handleLevelChange = useCallback(
    (next: AlertPresetLevel) => {
      void useAlertPresetStore.getState().setLevel(metric, next)
    },
    [metric],
  )

  // Battery presets are SoC %-based — a hard block, not just a prompt, without a valid battery config.
  const batteryBlocked = metric === 'battery' && !hasBatteryConfig
  // Speed thresholds scale off Rider Top Speed; without a usable value the preset can't resolve.
  const speedMissing = metric === 'speed' && !(riderTopSpeedKmh > 0)

  return (
    <View style={styles.container}>
      <AlertPresetControl
        metric={metric}
        level={level}
        onLevelChange={handleLevelChange}
        liveValue={value}
        riderTopSpeedKmh={riderTopSpeedKmh}
        hasBatteryConfig={hasBatteryConfig}
        customAlerts={customAlerts}
        hotRange={hotRange}
        disabled={batteryBlocked || speedMissing}
      />

      {batteryBlocked ? (
        <Text style={styles.note}>
          Battery presets need a valid battery configuration — they alert on state-of-charge %. Set
          up this board&apos;s battery to enable them.
        </Text>
      ) : null}

      {speedMissing ? (
        <View style={styles.prompt}>
          <Text style={styles.note}>
            Set your Rider Top Speed to enable speed presets — thresholds scale off it.
          </Text>
          <Button
            label="Set rider top speed"
            icon={SpeedometerIcon}
            variant="secondary"
            size="sm"
            onPress={() => router.push(routes.settingsLiveTelemetry)}
            style={styles.promptButton}
          />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  prompt: {
    gap: 8,
  },
  note: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  promptButton: {
    alignSelf: 'flex-start',
  },
})
