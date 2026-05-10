import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { BatteryBar } from '@/components/BatteryBar'
import { type SparklinePoint } from '@/components/charts/Sparkline'
import { estimateBatteryPercent } from '@/helpers/battery'
import { emaSeries } from '@/helpers/smoothing'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'
import { useLiveWindowMs } from '@/store/settingsStore'

// 20s half-life dampens throttle-burst dips while tracking real drain over ~1 min.
const BATTERY_SMOOTH_HALF_LIFE_MS = 20_000

export function BatteryIndicator() {
  const batteryVoltageHistory = useBleStore((s) => s.liveMetricHistory.batteryVoltage)
  const windowMs = useLiveWindowMs()
  const { minVoltage, maxVoltage } = useBoardStore(
    useShallow((s) => {
      const board = s.boards.find((b) => b.id === s.activeBoardId)
      return { minVoltage: board?.minVoltage ?? null, maxVoltage: board?.maxVoltage ?? null }
    }),
  )

  const { smoothVoltage, batterySeries } = useMemo(() => {
    const smooth = emaSeries(batteryVoltageHistory, BATTERY_SMOOTH_HALF_LIFE_MS)
    const series: SparklinePoint[] = smooth.flatMap((p) => {
      const pct = estimateBatteryPercent(p.value, minVoltage, maxVoltage)
      return pct != null ? [{ ts: p.ts, value: pct }] : []
    })
    return { smoothVoltage: smooth.at(-1)?.value ?? null, batterySeries: series }
  }, [batteryVoltageHistory, minVoltage, maxVoltage])

  const voltage = smoothVoltage
  const batteryConfigured = minVoltage != null && maxVoltage != null
  const percent = batteryConfigured
    ? estimateBatteryPercent(voltage ?? 0, minVoltage, maxVoltage)
    : null

  return (
    <BatteryBar
      percent={batteryConfigured ? percent : null}
      voltage={voltage}
      series={batteryConfigured ? batterySeries : undefined}
      windowMs={windowMs}
      hint={!batteryConfigured ? 'Set min/max V in board settings' : undefined}
    />
  )
}
