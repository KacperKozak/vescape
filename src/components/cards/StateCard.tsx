import { TelemetryCard } from '@/components/TelemetryCard'
import { DASH } from '@/helpers/format'
import { useBleStore } from '@/store/bleStore'

export function StateCard() {
  const hasLiveTelemetry = useBleStore((s) => s.liveStatus.boardLastPacketAt != null)

  return <TelemetryCard controlId="state" label="State" value={hasLiveTelemetry ? 'LIVE' : DASH} />
}
