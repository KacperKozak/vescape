import { TelemetryCard } from '@/components/TelemetryCard'
import { DASH, fmt } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'

export function ImuCard() {
  const v = useBleStore((s) => s.recentTelemetry.at(-1) ?? null)

  const value = v ? `P${fmt(v.pitch, 0)}° R${fmt(v.roll, 0)}° B${fmt(v.balancePitch, 0)}°` : DASH

  return <TelemetryCard label="IMU" value={value} />
}
