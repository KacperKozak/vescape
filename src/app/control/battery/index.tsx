import { useMemo } from 'react'
import { StyleSheet, Text } from 'react-native'

import { computeAutoRange } from '@/components/charts/chartMath'
import { ControlDetailLayout } from '@/components/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/control/MetricDetailChart'
import { MetricDetailGauge } from '@/components/control/MetricDetailGauge'
import { toTelemetryChartPoints } from '@/components/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { deriveBatteryConfig } from '@/lib/battery'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { theme } from '@/constants/theme'

const cfg = telemetry.battVoltage

export default function BatteryScreen() {
  const batteryVoltage = useLiveMetric(liveSelectors.batteryVoltage)
  const windowMs = useLiveWindowMs()
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const points = useMemo(() => toTelemetryChartPoints(batteryVoltage), [batteryVoltage])
  const battery = useMemo(
    () => deriveBatteryConfig(board?.batteryConfig ?? null),
    [board?.batteryConfig],
  )

  const range = useMemo(() => {
    if (battery.warning == null) {
      return { y: { min: battery.minVoltage, max: battery.maxVoltage } }
    }
    return computeAutoRange(points, { minSpan: cfg.minSpan })
  }, [battery, points])

  return (
    <ControlDetailLayout title={cfg.label} controlId={cfg.controlId} unit={cfg.unit}>
      {battery.warning != null ? (
        <Text style={styles.unconfigured}>
          Set battery config in board settings for pack range.
        </Text>
      ) : null}
      <MetricDetailGauge
        metric={cfg}
        value={liveTelemetryRuntime.values.batteryVoltage}
        min={range.y.min}
        max={range.y.max}
      />
      <MetricDetailChart metric={cfg} points={points} range={range} windowMs={windowMs} />
    </ControlDetailLayout>
  )
}

const styles = StyleSheet.create({
  unconfigured: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
})
