import { useMemo } from 'react'
import type { SharedValue } from 'react-native-reanimated'

import { SingleGauge, type DualGaugeAlert } from '@/components/ui/charts/DualGauge'
import type { TelemetryMetricConfig } from '@/constants/telemetry'
import { useAlertsStore } from '@/store/alertsStore'

interface MetricDetailGaugeProps {
  metric: TelemetryMetricConfig
  value: SharedValue<number | null>
  min?: number
  max?: number
  label?: string
}

export function MetricDetailGauge({
  metric,
  value,
  min = metric.chartRange.min,
  max = metric.chartRange.max,
  label = metric.label.toUpperCase(),
}: MetricDetailGaugeProps) {
  const alertRules = useAlertsStore((s) => s.rules)

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
      label={label}
      alerts={alerts}
    />
  )
}
