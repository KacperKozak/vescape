import { useMemo } from 'react'
import { StyleSheet, Text } from 'react-native'

import { computeAutoRange } from '@/components/ui/charts/chartMath'
import { ControlDetailLayout } from '@/components/domain/control/ControlDetailLayout'
import { MetricDetailChart } from '@/components/domain/control/MetricDetailChart'
import { MetricDetailGauge } from '@/components/domain/control/MetricDetailGauge'
import { toTelemetryChartPoints } from '@/components/domain/control/metricDetailData'
import { telemetry } from '@/constants/telemetry'
import { deriveBatteryConfig } from '@/lib/battery'
import { useLiveMetric, liveSelectors } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { theme } from '@/constants/theme'

const battVoltageCfg = telemetry.battVoltage
const battPercentCfg = { ...battVoltageCfg, unit: '%', decimals: 0, label: 'BATTERY' }

export default function BatteryScreen() {
  const batteryVoltage = useLiveMetric(liveSelectors.batteryVoltage)
  const windowMs = useLiveWindowMs()
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))

  const points = useMemo(() => toTelemetryChartPoints(batteryVoltage), [batteryVoltage])
  const battery = useMemo(
    () => deriveBatteryConfig(board?.batteryConfig ?? null),
    [board?.batteryConfig],
  )

  const configured = battery.warning == null
  const chartRange = useMemo(() => {
    if (configured) return { y: { min: battery.minVoltage, max: battery.maxVoltage } }
    return computeAutoRange(points, { minSpan: battVoltageCfg.minSpan })
  }, [configured, battery, points])

  return (
    <ControlDetailLayout
      title={battVoltageCfg.label}
      controlId={battVoltageCfg.controlId}
      unit={battVoltageCfg.unit}
    >
      {!configured ? (
        <Text style={styles.unconfigured}>
          Set battery config in board settings for pack range.
        </Text>
      ) : null}
      <MetricDetailGauge
        metric={configured ? battPercentCfg : battVoltageCfg}
        value={
          configured
            ? liveTelemetryRuntime.values.batteryPercent
            : liveTelemetryRuntime.values.batteryVoltage
        }
        min={configured ? 0 : chartRange.y.min}
        max={configured ? 100 : chartRange.y.max}
      />
      <MetricDetailChart
        metric={battVoltageCfg}
        points={points}
        range={chartRange}
        windowMs={windowMs}
      />
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
