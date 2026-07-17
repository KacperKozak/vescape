import type { BoardWarningSeverity } from 'vesc-ble'

import { theme } from '@/constants/theme'

/** Severity → theme status token. Critical uses the error palette (red); warn uses caution (yellow). */
export function severityStatus(severity: BoardWarningSeverity) {
  return severity === 'critical' ? theme.status.error : theme.status.caution
}

export const SEVERITY_LABEL: Record<BoardWarningSeverity, string> = {
  warn: 'Warning',
  critical: 'Critical',
}
