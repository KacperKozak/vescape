import { useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { favoriteRangeForSession, findSessionFavorite } from '@/modules/history/lib/favorites'
import { useFavoriteStore } from '@/modules/history/store/favoriteStore'
import { useHistoryStore, type HistorySession } from '@/modules/history/store/historyStore'
import { useMainScreenStore, type HistoryTab } from '@/screens/main/mainScreenStore'

/** Favorites-tab and trim workflow kept outside the already-busy main screen coordinator. */
export function useHistoryFavorites(selectedSession: HistorySession | null) {
  const trimming = useMainScreenStore((state) => state.trimRange != null)
  const historyTab = useMainScreenStore((state) => state.historyTab)
  const setHistoryTab = useMainScreenStore((state) => state.setHistoryTab)
  const [trimSeed, setTrimSeed] = useState<{ startMs: number; endMs: number } | null>(null)
  const {
    favorites,
    favoritesLoading,
    favoritesSaving,
    favoritesError,
    loadFavorites,
    addFavorite,
    removeFavorite,
  } = useFavoriteStore(
    useShallow((state) => ({
      favorites: state.favorites,
      favoritesLoading: state.loading,
      favoritesSaving: state.saving,
      favoritesError: state.error,
      loadFavorites: state.load,
      addFavorite: state.add,
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

  const resetHistoryFavorites = useCallback(() => {
    setHistoryTab('history')
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
    removeFavorite,
    loadFavorites,
    resetHistoryFavorites,
  }
}
