import type { Favorite } from 'vescape-core'

import { rideMovingWindow, type HistorySession } from '@/modules/history/lib/sessions'

/**
 * The range a star on an open ride pins: the full Moving Window, so favoriting a whole ride is one
 * tap. Rides with no precomputed window (legacy data) fall back to their wall-clock span.
 */
export function favoriteRangeForSession(
  session: Pick<HistorySession, 'movingStartAtMs' | 'movingEndAtMs' | 'startAtMs' | 'endAtMs'>,
): { startMs: number; endMs: number } {
  const window = rideMovingWindow(session)
  return window ?? { startMs: session.startAtMs, endMs: session.endAtMs }
}

/**
 * The Favorite already covering this ride's Moving Window, so the star reads as filled. Matched on
 * the range alone: only one Board Session records at a time, so a range never spans two boards, and
 * a Favorite stores a Board id rather than the ble id a history session carries.
 */
export function findSessionFavorite(
  favorites: Favorite[],
  session: Pick<HistorySession, 'movingStartAtMs' | 'movingEndAtMs' | 'startAtMs' | 'endAtMs'>,
): Favorite | null {
  const range = favoriteRangeForSession(session)
  return (
    favorites.find(
      (favorite) => favorite.startMs === range.startMs && favorite.endMs === range.endMs,
    ) ?? null
  )
}

/** Any overlap means deleting this history session must leave a protected telemetry island. */
export function sessionContainsFavorite(
  favorites: Favorite[],
  session: Pick<HistorySession, 'startAtMs' | 'endAtMs'>,
): boolean {
  return favorites.some(
    (favorite) => favorite.startMs <= session.endAtMs && favorite.endMs >= session.startAtMs,
  )
}
