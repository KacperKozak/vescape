import { useMemo } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

import { DualGauge } from '@/components/charts/DualGauge'
import { useAlertsStore } from '@/store/alertsStore'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const SPEED_MAX = 50
const DUTY_MAX = 100

interface DualGaugeIndicatorProps {
  compact?: boolean
  transparent?: boolean
  split?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

export function DualGaugeIndicator({
  compact,
  transparent,
  split,
  containerStyle,
}: DualGaugeIndicatorProps) {
  const speedSeries = useLiveMetric(liveSelectors.speed)
  const dutySeries = useLiveMetric(liveSelectors.duty)
  const windowMs = useLiveWindowMs()
  const alertRules = useAlertsStore((s) => s.rules)

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
      speedAlerts={speedAlerts}
      dutyAlerts={dutyAlerts}
      compact={compact}
      transparent={transparent}
      split={split}
      containerStyle={containerStyle}
    />
  )
}
