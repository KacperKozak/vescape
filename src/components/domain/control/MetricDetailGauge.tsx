import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import type { SharedValue } from 'react-native-reanimated'

import { SingleGauge, type DualGaugeAlert } from '@/components/ui/charts/DualGauge'
import type { TelemetryMetricConfig } from '@/constants/telemetry'
import {
  getHistoryMetricHotRange,
  getHistoryMetricKeyForControlId,
} from '@/lib/history/metricColorScale'
import { useAlertsStore } from '@/store/alertsStore'
import { useSettingsStore } from '@/store/settingsStore'

interface MetricDetailGaugeProps {
  metric: TelemetryMetricConfig
  value: SharedValue<number | null>
  min?: number
  max?: number
}

export function MetricDetailGauge({
  metric,
  value,
  min = metric.chartRange.min,
  max = metric.chartRange.max,
}: MetricDetailGaugeProps) {
  const alertRules = useAlertsStore((s) => s.rules)
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const hotMetric = getHistoryMetricKeyForControlId(metric.controlId)
  const hotRange = hotMetric
    ? getHistoryMetricHotRange(hotMetric, hotRanges, gradientsEnabled)
    : null

  const alerts = useMemo<DualGaugeAlert[]>(
    () =>
      metric.controlId == null
        ? []
        : alertRules
            .filter((rule) => rule.enabled && rule.controlId === metric.controlId)
            .map((rule) => ({
              id: rule.id,
              threshold: rule.threshold,
              thresholdMax: rule.thresholdMax,
            })),
    [alertRules, metric.controlId],
  )

  return (
    <SingleGauge
      value={value}
      min={min}
      max={max}
      color={metric.color}
      unit={metric.unit}
      decimals={metric.decimals}
      alerts={alerts}
      hotRange={hotRange}
      containerStyle={styles.gauge}
    />
  )
}

const styles = StyleSheet.create({
  gauge: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
})
