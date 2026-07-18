/** Delay before a typed legal/warning speed draft is committed to the store. */
export const LEGAL_SPEED_DRAFT_COMMIT_DELAY_MS = 350

export function hasSpeedDraftValue(value: string): boolean {
  return /\d/.test(value)
}

export function parseSpeed(value: string, fallback: number): number {
  const normalized = Number(value.replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(normalized) ? normalized : fallback
}
