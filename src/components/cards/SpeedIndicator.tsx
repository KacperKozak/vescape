import { useMemo } from 'react'

import { SpeedGauge } from '@/components/charts/SpeedGauge'
import { useAlertsStore } from '@/store/alertsStore'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/telemetry/liveTelemetryRuntime'

const SPEED_GAUGE_MAX_KMH = 50

export function SpeedIndicator() {
  const series = useBleStore((s) => s.liveMetricHistory.speed)
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

  return (
    <SpeedGauge
      value={liveTelemetryRuntime.values.speedKmh}
      gpsValue={null}
      series={series}
      windowMs={windowMs}
      distance={undefined}
      max={SPEED_GAUGE_MAX_KMH}
      alerts={speedAlerts}
    />
  )
}
