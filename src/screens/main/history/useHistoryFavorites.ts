import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import {
  favoriteRangeForSession,
  favoriteToSession,
  findSessionFavorite,
} from '@/modules/history/lib/favorites'
import { useFavoriteStore, type Favorite } from '@/modules/history/store/favoriteStore'
import { useHistoryStore, type HistorySession } from '@/modules/history/store/historyStore'
import { useMainScreenStore, type HistoryTab } from '@/screens/main/mainScreenStore'

/** Favorites-tab and trim workflow kept outside the already-busy main screen coordinator. */
export function useHistoryFavorites(selectedSession: HistorySession | null) {
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

  const openFavorite = useMemo(
    () => favorites.find((favorite) => favorite.id === openFavoriteId) ?? null,
    [favorites, openFavoriteId],
  )

  const selectHistoryTab = useCallback(
    (tab: HistoryTab) => {
      setHistoryTab(tab)
      if (tab === 'favorites') void loadFavorites()
    },
    [loadFavorites, setHistoryTab],
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

  const saveTrim = useCallback(async () => {
    const range = useMainScreenStore.getState().trimRange
    const session = useHistoryStore.getState().selectedSession
    if (!range || !session) return
    const favorite = await addFavorite({
      startMs: Math.min(range.startMs, range.endMs),
      endMs: Math.max(range.startMs, range.endMs),
      ...(session.deviceId ? { deviceId: session.deviceId } : {}),
    })
    if (favorite) useMainScreenStore.getState().endTrim()
  }, [addFavorite])

  /**
   * Favorite detail is the history detail path fed a favorite-backed session, so the chart, the map
   * route and the stats all come from the pinned range with no parallel implementation.
   */
  const showFavorite = useCallback(async (favorite: Favorite) => {
    historySessionBeforeFavorite.current = useHistoryStore.getState().selectedSession
    useMainScreenStore.getState().openFavorite(favorite.id)
    await useHistoryStore
      .getState()
      .selectSession(favoriteToSession(favorite, useHistoryStore.getState().blocks))
  }, [])

  const hideFavorite = useCallback(async () => {
    const historySession = historySessionBeforeFavorite.current
    historySessionBeforeFavorite.current = null
    useMainScreenStore.getState().closeFavorite()
    await useHistoryStore.getState().selectSession(historySession)
  }, [])

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

  /** Unpinning the open Favorite leaves nothing to show: fall back to the Favorites list. */
  const removeOpenFavorite = useCallback(async () => {
    const id = useMainScreenStore.getState().openFavoriteId
    if (!id) return
    await removeFavorite(id)
    if (useFavoriteStore.getState().error) return
    await hideFavorite()
  }, [hideFavorite, removeFavorite])

  const resetHistoryFavorites = useCallback(() => {
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
    selectedSessionFavorite,
    trimming,
    trimSeed,
    beginTrimFavorite,
    updateTrimRange,
    cancelTrim,
    saveTrim,
    openFavorite,
    showFavorite,
    hideFavorite,
    renameOpenFavorite,
    removeOpenFavorite,
    removeFavorite,
    loadFavorites,
    resetHistoryFavorites,
  }
}
