import { useMemo, type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import { DualGauge } from '@/components/ui/charts/DualGauge'
import { useAlertsStore } from '@/store/alertsStore'
import { useLiveSeries } from '@/hooks/useLiveMetric'
import { useLiveWindowMs, useSettingsStore } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { getHistoryMetricHotRange } from '@/lib/history/metricColorScale'

const SPEED_MAX = 50
const DUTY_MAX = 100

interface DualGaugeIndicatorProps {
  compact?: boolean
  transparent?: boolean
  split?: boolean
  middleSlot?: ReactNode
  containerStyle?: StyleProp<ViewStyle>
}

export function DualGaugeIndicator({
  compact,
  transparent,
  split,
  middleSlot,
  containerStyle,
}: DualGaugeIndicatorProps) {
  const speedSeries = useLiveSeries('speed')
  const dutySeries = useLiveSeries('duty')
  const windowMs = useLiveWindowMs()
  const alertRules = useAlertsStore((s) => s.rules)
  const gradientsEnabled = useSettingsStore((s) => s.historyMetricGradientsEnabled)
  const hotRanges = useSettingsStore((s) => s.historyMetricHotRanges)
  const speedHotRange = getHistoryMetricHotRange('speed', hotRanges, gradientsEnabled)
  const dutyHotRange = getHistoryMetricHotRange('duty', hotRanges, gradientsEnabled)

  const speedAlerts = useMemo(
    () =>
      alertRules
        .filter((rule) => rule.enabled && rule.controlId === 'speed')
        .map((rule) => ({
          id: rule.id,
          threshold: rule.threshold,
          thresholdMax: rule.thresholdMax,
        })),
    [alertRules],
  )

  const dutyAlerts = useMemo(
    () =>
      alertRules
        .filter((rule) => rule.enabled && rule.controlId === 'duty')
        .map((rule) => ({
          id: rule.id,
          threshold: rule.threshold,
          thresholdMax: rule.thresholdMax,
        })),
    [alertRules],
  )

  return (
    <DualGauge
      speedValue={liveTelemetryRuntime.values.speedKmh}
      dutyValue={liveTelemetryRuntime.values.dutyPercent}
      speedSeries={speedSeries}
      dutySeries={dutySeries}
      windowMs={windowMs}
      speedMax={SPEED_MAX}
      dutyMax={DUTY_MAX}
      speedHotRange={speedHotRange}
      dutyHotRange={dutyHotRange}
      speedAlerts={speedAlerts}
      dutyAlerts={dutyAlerts}
      compact={compact}
      transparent={transparent}
      split={split}
      middleSlot={middleSlot}
      containerStyle={containerStyle}
    />
  )
}
