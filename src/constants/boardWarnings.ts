import type { BoardWarningSeverity } from 'vesc-ble'

import { theme } from '@/constants/theme'

/** Severity → theme status token. Critical uses the error palette; warn uses warning (orange). */
export function severityStatus(severity: BoardWarningSeverity) {
  return severity === 'critical' ? theme.status.error : theme.status.warning
}

export const SEVERITY_LABEL: Record<BoardWarningSeverity, string> = {
  warn: 'Warning',
  critical: 'Critical',
}
