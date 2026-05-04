import { TelemetryCard } from '@/components/TelemetryCard'
import { DASH } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'
import { REFLOAT_STATE_NAMES, stateCompat } from '@/vesc/refloat'
import { FAULT_NAMES } from '@/vesc/types'

export function StateCard() {
  const v = useBleStore((s) => s.recentTelemetry.at(-1) ?? null)

  const compat = v ? stateCompat(v.state) : 0
  const stateName = v ? (REFLOAT_STATE_NAMES[compat] ?? `STATE_${compat}`) : DASH
  const display = v?.hasFault ? (FAULT_NAMES[v.faultCode] ?? `CODE_${v.faultCode}`) : stateName

  return <TelemetryCard label="State" value={v ? display : DASH} />
}
