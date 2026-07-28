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

/** True when a Favorite already covers this ride's Moving Window, so the star reads as filled. */
export function findSessionFavorite(
  favorites: Favorite[],
  session: Pick<
    HistorySession,
    'movingStartAtMs' | 'movingEndAtMs' | 'startAtMs' | 'endAtMs' | 'deviceId'
  >,
): Favorite | null {
  const range = favoriteRangeForSession(session)
  return (
    favorites.find(
      (favorite) =>
        favorite.startMs === range.startMs &&
        favorite.endMs === range.endMs &&
        (favorite.deviceId ?? null) === session.deviceId,
    ) ?? null
  )
}
