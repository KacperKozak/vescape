import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BackHandler, ToastAndroid } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { exitApp } from 'vescape-core'

import type { MainMapHandle } from '@/screens/main/map/MainMap'
import { useMainScreenStore, type HistoryTab } from '@/screens/main/mainScreenStore'
import {
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from '@/screens/main/mainState'
import { useBleStore } from '@/modules/board/store/bleStore'
import { useHistoryStore, type HistorySession } from '@/modules/history/store/historyStore'
import { useFavoriteStore } from '@/modules/history/store/favoriteStore'
import { favoriteRangeForSession, findSessionFavorite } from '@/modules/history/lib/favorites'
import { useMapStore } from '@/modules/map/store/mapStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import { useWeatherStore } from '@/modules/weather/store/weatherStore'
import { useMediaHistory } from '@/modules/history/hooks/useMediaHistory'
import type { MediaAssetInput } from '@/modules/history/lib/mediaHistory'
import { deleteRideMediaAssets } from '@/modules/history/store/rideMediaFiles'
import { getHistoryPreviewRoute } from '@/modules/history/lib/previewRoute'

interface UseMainScreenControllerArgs {
  mapRef: RefObject<MainMapHandle | null>
}

const TARGET_INITIAL_HISTORY_SESSIONS = 12
const MAX_HISTORY_PREFETCH_PAGES = 8

export function useMainScreenController({ mapRef }: UseMainScreenControllerArgs) {
  const backPressedOnce = useRef(false)
  const [openMediaAssetId, setOpenMediaAssetId] = useState<string | null>(null)
  // Flips only on trim enter/exit; the live range lives in the store where narrow subscribers
  // (map highlight, stats preview) read it without re-rendering the whole screen.
  const trimming = useMainScreenStore((s) => s.trimRange != null)
  // A stable seed for the chart handles, captured when trim opens so per-drag store writes don't
  // fight the handle positions.
  const [trimSeed, setTrimSeed] = useState<{ startMs: number; endMs: number } | null>(null)
  const {
    mode,
    historyTab,
    historySheetVisible,
    mapSelector,
    perspectiveEnabled,
    activeHistoryMapMetric,
    enterTelemetry,
    enterMap,
    enterWeather,
    enterLegalLimits,
    enterHistory,
    setHistoryTab,
    setHistorySheetVisible,
    setMapSelector,
    dismissMapSelector,
    setPerspectiveEnabled,
    setSeekTimeMs,
    setActiveHistoryMapMetric,
  } = useMainScreenStore(
    useShallow((s) => ({
      mode: s.mode,
      historyTab: s.historyTab,
      historySheetVisible: s.historySheetVisible,
      mapSelector: s.mapSelector,
      perspectiveEnabled: s.perspectiveEnabled,
      activeHistoryMapMetric: s.activeHistoryMapMetric,
      enterTelemetry: s.enterTelemetry,
      enterMap: s.enterMap,
      enterWeather: s.enterWeather,
      enterLegalLimits: s.enterLegalLimits,
      enterHistory: s.enterHistory,
      setHistoryTab: s.setHistoryTab,
      setHistorySheetVisible: s.setHistorySheetVisible,
      setMapSelector: s.setMapSelector,
      dismissMapSelector: s.dismissMapSelector,
      setPerspectiveEnabled: s.setPerspectiveEnabled,
      setSeekTimeMs: s.setSeekTimeMs,
      setActiveHistoryMapMetric: s.setActiveHistoryMapMetric,
    })),
  )
  const {
    favorites,
    favoritesLoading,
    favoritesSaving,
    favoritesError,
    loadFavorites,
    addFavorite,
    removeFavorite,
  } = useFavoriteStore(
    useShallow((s) => ({
      favorites: s.favorites,
      favoritesLoading: s.loading,
      favoritesSaving: s.saving,
      favoritesError: s.error,
      loadFavorites: s.load,
      addFavorite: s.add,
      removeFavorite: s.remove,
    })),
  )
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const latestApproximateLocation = useBleStore((s) => s.latestApproximateLocation)
  const fetchWeather = useWeatherStore((s) => s.fetch)
  const refreshWeather = useWeatherStore((s) => s.refresh)
  const lastGpsLatitude = useSettingsStore((s) => s.lastGpsLatitude)
  const lastGpsLongitude = useSettingsStore((s) => s.lastGpsLongitude)
  const mapStyleKey = useSettingsStore((s) => s.mapStyleKey)
  const satelliteOverlayEnabled = useSettingsStore((s) => s.satelliteOverlayEnabled)
  const satelliteImageryOpacity = useSettingsStore((s) => s.satelliteImageryOpacity)
  const satelliteMapImageryOpacity = useSettingsStore((s) => s.satelliteMapImageryOpacity)
  const satelliteImagerySaturation = useSettingsStore((s) => s.satelliteImagerySaturation)
  const hideTelemetryMapDetails = useSettingsStore((s) => s.hideTelemetryMapDetails)
  const mapNavigationMode = useSettingsStore((s) => s.mapNavigationMode)
  const setSetting = useSettingsStore((s) => s.set)
  const {
    blocks,
    sessions,
    selectedSession,
    sessionSamples,
    sessionGpsSamples,
    sessionMarkers,
    loadingSession,
    loading: historyLoading,
    hasMore: historyHasMore,
    error: historyError,
    loadInitial,
    loadMore,
    selectSession,
    removeSelectedSession,
  } = useHistoryStore(
    useShallow((s) => ({
      blocks: s.blocks,
      sessions: s.sessions,
      selectedSession: s.selectedSession,
      sessionSamples: s.sessionSamples,
      sessionGpsSamples: s.sessionGpsSamples,
      sessionMarkers: s.sessionMarkers,
      loadingSession: s.loadingSession,
      loading: s.loading,
      hasMore: s.hasMore,
      error: s.error,
      loadInitial: s.loadInitial,
      loadMore: s.loadMore,
      selectSession: s.selectSession,
      removeSelectedSession: s.removeSelectedSession,
    })),
  )
  const {
    mapPoints,
    selectedMapPointId,
    hiddenMapPointKinds,
    loadMapPoints,
    saveMapPoint,
    replaceDirectionPoint,
    clearDirectionPoint,
    removeMapPoint,
    toggleMapPointSelection,
    clearSelectedMapPoints,
    toggleMapPointKindVisibility,
  } = useMapStore(
    useShallow((s) => ({
      mapPoints: s.mapPoints,
      selectedMapPointId: s.selectedMapPointId,
      hiddenMapPointKinds: s.hiddenMapPointKinds,
      loadMapPoints: s.load,
      saveMapPoint: s.saveMapPoint,
      replaceDirectionPoint: s.replaceDirectionPoint,
      clearDirectionPoint: s.clearDirectionPoint,
      removeMapPoint: s.removeMapPoint,
      toggleMapPointSelection: s.toggleMapPointSelection,
      clearSelectedMapPoints: s.clearSelectedMapPoints,
      toggleMapPointKindVisibility: s.toggleMapPointKindVisibility,
    })),
  )
  const directionPoint = useMemo(
    () => mapPoints.find((point) => point.kind === 'direction') ?? null,
    [mapPoints],
  )
  const mediaHistory = useMediaHistory({
    selectedSession,
    gpsSamples: sessionGpsSamples,
    markers: sessionMarkers,
  })

  useEffect(() => {
    void loadMapPoints()
  }, [loadMapPoints])

  useEffect(() => {
    setSeekTimeMs(null)
    // Switching rides abandons any in-progress trim. The stale seed is harmless — it is only read
    // while trimming, which endTrim() ends here.
    useMainScreenStore.getState().endTrim()
  }, [selectedSession, setSeekTimeMs])

  useEffect(() => {
    const loc = liveLocations.at(-1) ?? latestApproximateLocation
    const lat = loc?.latitude ?? lastGpsLatitude
    const lon = loc?.longitude ?? lastGpsLongitude
    if (lat != null && lon != null) {
      void fetchWeather(lat, lon)
    }
  }, [liveLocations, latestApproximateLocation, lastGpsLatitude, lastGpsLongitude, fetchWeather])

  const weatherActive = mode === 'weather'
  const legalLimitsActive = mode === 'legalLimits'
  const historyActive = mode === 'history'
  const rotationLocked = mapNavigationMode === 'northUp'
  const previousRide = getPreviousRideSession(sessions, selectedSession)
  const nextRide = getNextRideSession(sessions, selectedSession)
  const canPreviousRide = !!previousRide || historyHasMore

  const historyPreview = useMemo(() => {
    if (!selectedSession) return null
    if (!loadingSession) return null
    const latitude = selectedSession.centerLatitude ?? sessionGpsSamples[0]?.latitude
    const longitude = selectedSession.centerLongitude ?? sessionGpsSamples[0]?.longitude
    if (latitude == null || longitude == null) return null
    return {
      key: selectedSession.id,
      latitude,
      longitude,
      minLatitude: selectedSession.minLatitude,
      maxLatitude: selectedSession.maxLatitude,
      minLongitude: selectedSession.minLongitude,
      maxLongitude: selectedSession.maxLongitude,
    }
  }, [loadingSession, selectedSession, sessionGpsSamples])

  const historyPreviewRoute = useMemo(
    () => (loadingSession ? getHistoryPreviewRoute(sessionSamples) : []),
    [loadingSession, sessionSamples],
  )

  const exitMapFocus = useCallback(() => {
    enterTelemetry()
    mapRef.current?.recenterLive()
  }, [enterTelemetry, mapRef])

  const enterWeatherMode = useCallback(() => {
    enterWeather()
    mapRef.current?.focusWeather()
  }, [enterWeather, mapRef])

  const exitWeatherMode = useCallback(() => {
    enterTelemetry()
    requestAnimationFrame(() => mapRef.current?.recenterLive())
  }, [enterTelemetry, mapRef])

  const enterLegalLimitsMode = useCallback(() => {
    enterLegalLimits()
    mapRef.current?.focusLegalLimits()
  }, [enterLegalLimits, mapRef])

  const exitLegalLimitsMode = useCallback(() => {
    enterTelemetry()
    requestAnimationFrame(() => mapRef.current?.recenterLive())
  }, [enterTelemetry, mapRef])

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

  /** Star on an open ride opens trim mode, seeded with the full Moving Window (one-tap whole ride). */
  const beginTrimFavorite = useCallback(() => {
    const session = useHistoryStore.getState().selectedSession
    if (!session) return
    const range = favoriteRangeForSession(session)
    setTrimSeed(range)
    useMainScreenStore.getState().beginTrim(range)
  }, [setTrimSeed])

  /** Per drag-frame update of the trimmed span; drives the live map highlight and stats preview. */
  const updateTrimRange = useCallback((startMs: number, endMs: number) => {
    useMainScreenStore.getState().setTrimRange({ startMs, endMs })
  }, [])

  const cancelTrim = useCallback(() => {
    useMainScreenStore.getState().endTrim()
  }, [])

  /** Save the trimmed range as a Favorite. Native mints identity, timestamps and durable stats. */
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

  const exitHistory = useCallback(() => {
    setOpenMediaAssetId(null)
    setHistoryTab('history')
    useMainScreenStore.getState().endTrim()
    void selectSession(null)
    enterTelemetry()
    requestAnimationFrame(() =>
      mapRef.current?.recenterLive({ resetPadding: true, animationDuration: 0 }),
    )
  }, [enterTelemetry, mapRef, selectSession, setHistoryTab])

  const loadOlderHistoryPages = useCallback(
    async (targetSessionCount = TARGET_INITIAL_HISTORY_SESSIONS) => {
      let pagesLoaded = 0
      while (
        useHistoryStore.getState().hasMore &&
        useHistoryStore.getState().sessions.length < targetSessionCount &&
        pagesLoaded < MAX_HISTORY_PREFETCH_PAGES
      ) {
        await useHistoryStore.getState().loadMore()
        pagesLoaded += 1
      }
    },
    [],
  )

  const enterHistoryMode = useCallback(async () => {
    enterHistory()
    void loadFavorites()
    await loadInitial()
    await loadOlderHistoryPages()
    if (useMainScreenStore.getState().mode !== 'history') return
    const latest = getLatestSession(useHistoryStore.getState().sessions)
    if (latest) {
      await selectSession(latest)
    }
  }, [enterHistory, loadFavorites, loadInitial, loadOlderHistoryPages, selectSession])

  const selectPreviousRide = useCallback(async () => {
    setOpenMediaAssetId(null)
    let previous = getPreviousRideSession(
      useHistoryStore.getState().sessions,
      useHistoryStore.getState().selectedSession,
    )
    let pagesLoaded = 0
    while (
      !previous &&
      useHistoryStore.getState().hasMore &&
      pagesLoaded < MAX_HISTORY_PREFETCH_PAGES
    ) {
      await useHistoryStore.getState().loadMore()
      previous = getPreviousRideSession(
        useHistoryStore.getState().sessions,
        useHistoryStore.getState().selectedSession,
      )
      pagesLoaded += 1
    }
    if (previous) await selectSession(previous)
  }, [selectSession])

  const selectNextRide = useCallback(async () => {
    setOpenMediaAssetId(null)
    const next = getNextRideSession(
      useHistoryStore.getState().sessions,
      useHistoryStore.getState().selectedSession,
    )
    if (next) await selectSession(next)
  }, [selectSession])

  const removeSession = useCallback(() => {
    const session = useHistoryStore.getState().selectedSession
    if (session) {
      try {
        deleteRideMediaAssets(session.id)
      } catch {
        // Ride removal must not fail on media cleanup; orphaned folders are harmless.
      }
    }
    void removeSelectedSession()
  }, [removeSelectedSession])

  const selectRide = useCallback(
    (session: HistorySession) => {
      setOpenMediaAssetId(null)
      setHistorySheetVisible(false)
      void selectSession(session)
      enterHistory()
    },
    [enterHistory, selectSession, setHistorySheetVisible],
  )

  const handleMapFocus = useCallback(() => {
    if (mode === 'map') return
    enterMap()
    if (mode === 'weather' || mode === 'legalLimits') {
      requestAnimationFrame(() => mapRef.current?.recenterLive())
    }
  }, [enterMap, mapRef, mode])

  const setMapStyleKey = useCallback(
    (key: typeof mapStyleKey) => {
      void setSetting('mapStyleKey', key)
    },
    [setSetting],
  )

  const setMapNavigationMode = useCallback(
    (nextMode: typeof mapNavigationMode) => {
      void setSetting('mapNavigationMode', nextMode)
    },
    [setSetting],
  )

  const setSatelliteMapImageryOpacity = useCallback(
    (nextOpacity: number) => {
      void setSetting('satelliteMapImageryOpacity', nextOpacity)
    },
    [setSetting],
  )

  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'history') {
          if (useMainScreenStore.getState().trimRange) {
            useMainScreenStore.getState().endTrim()
            return true
          }
          exitHistory()
          return true
        }
        if (mode === 'weather') {
          exitWeatherMode()
          return true
        }
        if (mode === 'legalLimits') {
          exitLegalLimitsMode()
          return true
        }
        if (mode === 'map') {
          exitMapFocus()
          return true
        }
        if (backPressedOnce.current) {
          exitApp()
          return true
        }
        backPressedOnce.current = true
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT)
        setTimeout(() => {
          backPressedOnce.current = false
        }, 2000)
        return true
      })
      return () => handler.remove()
    }, [exitHistory, exitLegalLimitsMode, exitMapFocus, exitWeatherMode, mode]),
  )

  return {
    mode,
    liveLocations,
    latestApproximateLocation,
    blocks,
    historyActive,
    legalLimitsActive,
    mapStyleKey,
    satelliteOverlayEnabled,
    satelliteImageryOpacity,
    satelliteMapImageryOpacity,
    setSatelliteMapImageryOpacity,
    satelliteImagerySaturation,
    hideTelemetryMapDetails,
    setMapStyleKey,
    mapNavigationMode,
    setMapNavigationMode,
    mapSelector,
    setMapSelector,
    dismissMapSelector,
    rotationLocked,
    perspectiveEnabled,
    setPerspectiveEnabled,
    directionPoint,
    mapPoints,
    selectedMapPointId,
    hiddenMapPointKinds,
    saveMapPoint,
    replaceDirectionPoint,
    clearDirectionPoint,
    removeMapPoint,
    toggleMapPointSelection,
    clearSelectedMapPoints,
    toggleMapPointKindVisibility,
    sessions,
    selectedSession,
    sessionSamples,
    sessionGpsSamples,
    sessionMarkers,
    mediaHistory,
    openMediaAssetId,
    openMedia: (asset: MediaAssetInput) => setOpenMediaAssetId(asset.id),
    closeMedia: () => setOpenMediaAssetId(null),
    historyPreview,
    historyPreviewRoute,
    previousRide,
    nextRide,
    canPreviousRide,
    loadingSession,
    historyLoading,
    historyHasMore,
    historyError,
    historySheetVisible,
    setHistorySheetVisible,
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
    selectSession,
    loadMoreHistory: loadMore,
    selectPreviousRide,
    selectNextRide,
    enterHistoryMode,
    exitHistory,
    removeSession,
    selectRide,
    weatherActive,
    enterWeatherMode,
    exitWeatherMode,
    enterLegalLimitsMode,
    exitLegalLimitsMode,
    refreshWeather,
    handleMapFocus,
    exitMapFocus,
    onSeek: setSeekTimeMs,
    activeHistoryMapMetric,
    setActiveHistoryMapMetric,
  }
}
