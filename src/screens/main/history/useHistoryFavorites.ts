import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import {
  favoriteRangeForSession,
  favoriteSessionId,
  favoriteToSession,
  findSessionFavorite,
} from '@/modules/history/lib/favorites'
import { useFavoriteStore, type Favorite } from '@/modules/history/store/favoriteStore'
import {
  useHistoryStore,
  type HistorySession,
  type TelemetryMinuteBucket,
} from '@/modules/history/store/historyStore'
import { useMainScreenStore, type HistoryTab } from '@/screens/main/mainScreenStore'
import {
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from '@/screens/main/mainState'

/** Favorites-tab and trim workflow kept outside the already-busy main screen coordinator. */
export function useHistoryFavorites(
  selectedSession: HistorySession | null,
  blocks: TelemetryMinuteBucket[],
) {
  const trimming = useMainScreenStore((state) => state.trimRange != null)
  const historyTab = useMainScreenStore((state) => state.historyTab)
  const openFavoriteId = useMainScreenStore((state) => state.openFavoriteId)
  const setHistoryTab = useMainScreenStore((state) => state.setHistoryTab)
  const [trimSeed, setTrimSeed] = useState<{ startMs: number; endMs: number } | null>(null)
  const historySessionBeforeFavorite = useRef<HistorySession | null>(null)
  const {
    favorites,
    favoritesLoading,
    favoritesSaving,
    favoritesError,
    loadFavorites,
    addFavorite,
    renameFavorite,
    removeFavorite,
  } = useFavoriteStore(
    useShallow((state) => ({
      favorites: state.favorites,
      favoritesLoading: state.loading,
      favoritesSaving: state.saving,
      favoritesError: state.error,
      loadFavorites: state.load,
      addFavorite: state.add,
      renameFavorite: state.rename,
      removeFavorite: state.remove,
    })),
  )

  useEffect(() => {
    useMainScreenStore.getState().endTrim()
  }, [selectedSession])

  const selectedSessionFavorite = useMemo(
    () => (selectedSession ? findSessionFavorite(favorites, selectedSession) : null),
    [favorites, selectedSession],
  )

  const favoriteSessions = useMemo(
    () => favorites.map((favorite) => favoriteToSession(favorite, blocks)),
    [blocks, favorites],
  )

  const openFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === openFavoriteId) ?? null,
    [favorites, openFavoriteId],
  )

  const selectFavorite = useCallback(async (favorite: Favorite) => {
    useMainScreenStore.getState().openFavorite(favorite.id)
    await useHistoryStore
      .getState()
      .selectSession(favoriteToSession(favorite, useHistoryStore.getState().blocks))
  }, [])

  const selectHistoryTab = useCallback(
    (tab: HistoryTab) => {
      if (tab === useMainScreenStore.getState().historyTab) return

      if (tab === 'history') {
        setHistoryTab(tab)
        const session =
          historySessionBeforeFavorite.current ??
          getLatestSession(useHistoryStore.getState().sessions)
        historySessionBeforeFavorite.current = null
        void useHistoryStore.getState().selectSession(session)
        return
      }

      historySessionBeforeFavorite.current = useHistoryStore.getState().selectedSession
      setHistoryTab(tab)
      const cachedLatest = useFavoriteStore.getState().favorites[0]
      if (cachedLatest) void selectFavorite(cachedLatest)
      void loadFavorites().then(() => {
        if (useMainScreenStore.getState().historyTab !== 'favorites') return
        const latest = useFavoriteStore.getState().favorites[0]
        if (latest) void selectFavorite(latest)
        else void useHistoryStore.getState().selectSession(null)
      })
    },
    [loadFavorites, selectFavorite, setHistoryTab],
  )

  const beginTrimFavorite = useCallback(() => {
    const session = useHistoryStore.getState().selectedSession
    if (!session) return
    const range = favoriteRangeForSession(session)
    setTrimSeed(range)
    useMainScreenStore.getState().beginTrim(range)
  }, [])

  const updateTrimRange = useCallback((startMs: number, endMs: number) => {
    useMainScreenStore.getState().setTrimRange({ startMs, endMs })
  }, [])

  const cancelTrim = useCallback(() => {
    useMainScreenStore.getState().endTrim()
  }, [])

  const saveTrim = useCallback(
    async (name: string) => {
      const range = useMainScreenStore.getState().trimRange
      const session = useHistoryStore.getState().selectedSession
      if (!range || !session) return
      const favorite = await addFavorite({
        startMs: Math.min(range.startMs, range.endMs),
        endMs: Math.max(range.startMs, range.endMs),
        ...(session.deviceId ? { deviceId: session.deviceId } : {}),
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      if (favorite) useMainScreenStore.getState().endTrim()
    },
    [addFavorite],
  )

  const selectPreviousFavorite = useCallback(async () => {
    const previous = getPreviousRideSession(
      favoriteSessions,
      useHistoryStore.getState().selectedSession,
    )
    if (!previous) return
    const favorite = useFavoriteStore
      .getState()
      .favorites.find((item) => previous.id === favoriteSessionId(item.id))
    if (favorite) await selectFavorite(favorite)
  }, [favoriteSessions, selectFavorite])

  const selectNextFavorite = useCallback(async () => {
    const next = getNextRideSession(favoriteSessions, useHistoryStore.getState().selectedSession)
    if (!next) return
    const favorite = useFavoriteStore
      .getState()
      .favorites.find((item) => next.id === favoriteSessionId(item.id))
    if (favorite) await selectFavorite(favorite)
  }, [favoriteSessions, selectFavorite])

  const renameOpenFavorite = useCallback(
    async (name: string | null) => {
      const id = useMainScreenStore.getState().openFavoriteId
      if (!id) return
      await renameFavorite(id, name)
      const renamed = useFavoriteStore.getState().favorites.find((item) => item.id === id)
      // The name doubles as the session label, so the open detail has to be rebuilt to show it.
      if (renamed) {
        await useHistoryStore
          .getState()
          .selectSession(favoriteToSession(renamed, useHistoryStore.getState().blocks))
      }
    },
    [renameFavorite],
  )

  const removeOpenFavorite = useCallback(async () => {
    const id = useMainScreenStore.getState().openFavoriteId
    if (!id) return
    const removedIndex = useFavoriteStore.getState().favorites.findIndex((item) => item.id === id)
    await removeFavorite(id)
    if (useFavoriteStore.getState().error) return
    const remaining = useFavoriteStore.getState().favorites
    const replacement = remaining[Math.min(Math.max(removedIndex, 0), remaining.length - 1)]
    if (replacement) await selectFavorite(replacement)
    else {
      useMainScreenStore.getState().closeFavorite()
      await useHistoryStore.getState().selectSession(null)
    }
  }, [removeFavorite, selectFavorite])

  const resetHistoryFavorites = useCallback(() => {
    historySessionBeforeFavorite.current = null
    setHistoryTab('history')
    useMainScreenStore.getState().closeFavorite()
    useMainScreenStore.getState().endTrim()
  }, [setHistoryTab])

  return {
    historyTab,
    selectHistoryTab,
    favorites,
    favoritesLoading,
    favoritesSaving,
    favoritesError,
    favoriteSessions,
    selectedSessionFavorite,
    trimming,
    trimSeed,
    beginTrimFavorite,
    updateTrimRange,
    cancelTrim,
    saveTrim,
    openFavorite,
    selectFavorite,
    canPreviousFavorite: getPreviousRideSession(favoriteSessions, selectedSession) != null,
    canNextFavorite: getNextRideSession(favoriteSessions, selectedSession) != null,
    selectPreviousFavorite,
    selectNextFavorite,
    renameOpenFavorite,
    removeOpenFavorite,
    loadFavorites,
    resetHistoryFavorites,
  }
}
