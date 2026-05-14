import type { HistorySession } from '@/store/historyStore'

export interface BaseOverlayState {
  mapFocused: boolean
  hasRide: boolean
}

export function getLatestSession(sessions: HistorySession[]): HistorySession | null {
  return sessions[0] ?? null
}

export function getPreviousRideSession(
  sessions: HistorySession[],
  selected: HistorySession | null,
): HistorySession | null {
  if (!selected) return null
  const index = sessions.findIndex((session) => session.id === selected.id)
  if (index < 0) return null
  return sessions[index + 1] ?? null
}

export function getNextRideSession(
  sessions: HistorySession[],
  selected: HistorySession | null,
): HistorySession | null {
  if (!selected) return null
  const index = sessions.findIndex((session) => session.id === selected.id)
  if (index <= 0) return null
  return sessions[index - 1] ?? null
}

export function canShowBaseOverlays({ mapFocused, hasRide }: BaseOverlayState): boolean {
  return !mapFocused && !hasRide
}
