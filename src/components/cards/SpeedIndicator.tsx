import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { type SparklinePoint } from '@/components/charts/Sparkline'
import { SpeedGauge } from '@/components/charts/SpeedGauge'
import { fmtKm } from '@/helpers/format'
import { useAlertsStore } from '@/store/alertsStore'
import { useBleStore } from '@/store/bleStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const SPEED_GAUGE_MAX_KMH = 50

export function SpeedIndicator() {
  const { recentTelemetry, recentLocations } = useBleStore(
    useShallow((s) => ({
      recentTelemetry: s.recentTelemetry,
      recentLocations: s.recentLocations,
    })),
  )
  const windowMs = useLiveWindowMs()

  const v = recentTelemetry.at(-1) ?? null
  const gpsFix = recentLocations.at(-1) ?? null
  const gpsSpeedKmh = gpsFix?.speedMps != null ? gpsFix.speedMps * 3.6 : null
  const alertRules = useAlertsStore((s) => s.rules)

  const series = useMemo<SparklinePoint[]>(
    () => recentTelemetry.map((t) => ({ ts: t.lastPacketAt, value: Math.abs(t.speed) })),
    [recentTelemetry],
  )
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
      value={v ? Math.abs(v.speed) : null}
      gpsValue={gpsSpeedKmh}
      series={series}
      windowMs={windowMs}
      distance={v?.odometer != null ? `${fmtKm(v.odometer)} km` : undefined}
      max={SPEED_GAUGE_MAX_KMH}
      alerts={speedAlerts}
    />
  )
}
