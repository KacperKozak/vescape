import { TelemetryCard } from '@/components/TelemetryCard'
import { DASH } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'

export function FootpadCard() {
  const v = useBleStore((s) => s.recentTelemetry.at(-1) ?? null)

  return (
    <TelemetryCard
      label="Footpad"
      value={v ? `${v.adc1.toFixed(2)} / ${v.adc2.toFixed(2)}` : DASH}
    />
  )
}
