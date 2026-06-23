import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { type SparklinePoint } from '@/components/ui/charts/Sparkline'
import { telemetry } from '@/constants/telemetry'
import { theme } from '@/constants/theme'
import { deriveBatteryConfig } from '@/lib/battery'
import { liveSelectors, useLiveBuckets, useLiveLatest } from '@/hooks/useLiveMetric'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'

const BATTERY_LOW_PCT = 30

export function useBatteryTelemetry() {
  const batteryVoltageHistory = useLiveBuckets('batteryVoltage')
  const latestVoltage = useLiveLatest(liveSelectors.batteryVoltage)
  const latestPercent = useLiveLatest(liveSelectors.batteryPercent)
  const windowMs = useLiveWindowMs()
  const batteryConfig = useBoardStore(
    useShallow((s) => {
      const board = s.boards.find((b) => b.id === s.activeBoardId)
      return board?.batteryConfig ?? null
    }),
  )
  const { series, range } = useMemo(() => {
    const configured = deriveBatteryConfig(batteryConfig).warning == null
    return {
      series: batteryVoltageHistory.map(
        (point): SparklinePoint => ({ ts: point.ts, value: point.value }),
      ),
      range: configured
        ? {
            min: deriveBatteryConfig(batteryConfig!).minVoltage,
            max: deriveBatteryConfig(batteryConfig!).maxVoltage,
          }
        : undefined,
    }
  }, [batteryConfig, batteryVoltageHistory])
  const voltage = latestVoltage
  const percent = range ? latestPercent : null

  return {
    percent,
    voltage,
    series,
    range,
    windowMs,
    color:
      percent != null && percent < BATTERY_LOW_PCT
        ? theme.warning.color
        : telemetry.battVoltage.color,
    hint: range ? undefined : 'Set battery config in board settings',
  }
}
