import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BackHandler, ToastAndroid } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { exitApp } from 'vesc-ble'

import type { CenterMapHandle } from '@/screens/center/CenterMap'
import { useCenterScreenStore } from '@/screens/center/centerScreenStore'
import {
  getLatestSession,
  getNextRideSession,
  getPreviousRideSession,
} from '@/screens/center/centerState'
import { useBleStore } from '@/store/bleStore'
import { useHistoryStore, type HistorySession } from '@/store/historyStore'
import { useMapStore } from '@/store/mapStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useWeatherStore } from '@/store/weatherStore'
import { findNearestSampleIndexByTime } from '@/lib/history/playback'
import { useMediaHistory } from '@/hooks/useMediaHistory'
import type { MediaHistoryAsset } from '@/lib/history/mediaHistory'

interface UseCenterScreenControllerArgs {
  mapRef: RefObject<CenterMapHandle | null>
}

const TARGET_INITIAL_HISTORY_SESSIONS = 12
const MAX_HISTORY_PREFETCH_PAGES = 8

export function useCenterScreenController({ mapRef }: UseCenterScreenControllerArgs) {
  const backPressedOnce = useRef(false)
  const [heading, setHeading] = useState(0)
  const [openMediaAssetId, setOpenMediaAssetId] = useState<string | null>(null)
  const {
    mode,
    historySheetVisible,
    mapSelector,
    perspectiveEnabled,
    seekTimeMs,
    activeHistoryMapMetric,
    enterTelemetry,
    enterMap,
    enterWeather,
    enterHistory,
    setHistorySheetVisible,
    setMapSelector,
    dismissMapSelector,
    setPerspectiveEnabled,
    setSeekTimeMs,
    setActiveHistoryMapMetric,
  } = useCenterScreenStore(
    useShallow((s) => ({
      mode: s.mode,
      historySheetVisible: s.historySheetVisible,
      mapSelector: s.mapSelector,
      perspectiveEnabled: s.perspectiveEnabled,
      seekTimeMs: s.seekTimeMs,
      activeHistoryMapMetric: s.activeHistoryMapMetric,
      enterTelemetry: s.enterTelemetry,
      enterMap: s.enterMap,
      enterWeather: s.enterWeather,
      enterHistory: s.enterHistory,
      setHistorySheetVisible: s.setHistorySheetVisible,
      setMapSelector: s.setMapSelector,
      dismissMapSelector: s.dismissMapSelector,
      setPerspectiveEnabled: s.setPerspectiveEnabled,
      setSeekTimeMs: s.setSeekTimeMs,
      setActiveHistoryMapMetric: s.setActiveHistoryMapMetric,
    })),
  )
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const latestApproximateLocation = useBleStore((s) => s.latestApproximateLocation)
  const fetchWeather = useWeatherStore((s) => s.fetch)
  const refreshWeather = useWeatherStore((s) => s.refresh)
  const lastGpsLatitude = useSettingsStore((s) => s.lastGpsLatitude)
  const lastGpsLongitude = useSettingsStore((s) => s.lastGpsLongitude)
  const mapStyleKey = useSettingsStore((s) => s.mapStyleKey)
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
  }, [selectedSession, setSeekTimeMs])

  const seekGpsPosition = useMemo(() => {
    if (seekTimeMs == null || sessionGpsSamples.length === 0) return null
    const idx = findNearestSampleIndexByTime(sessionGpsSamples, seekTimeMs)
    return idx >= 0 ? sessionGpsSamples[idx] : null
  }, [seekTimeMs, sessionGpsSamples])

  useEffect(() => {
    const loc = liveLocations.at(-1) ?? latestApproximateLocation
    const lat = loc?.latitude ?? lastGpsLatitude
    const lon = loc?.longitude ?? lastGpsLongitude
    if (lat != null && lon != null) {
      void fetchWeather(lat, lon)
    }
  }, [liveLocations, latestApproximateLocation, lastGpsLatitude, lastGpsLongitude, fetchWeather])

  const weatherActive = mode === 'weather'
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

  const exitHistory = useCallback(() => {
    setOpenMediaAssetId(null)
    void selectSession(null)
    enterTelemetry()
    requestAnimationFrame(() =>
      mapRef.current?.recenterLive({ resetPadding: true, animationDuration: 0 }),
    )
  }, [enterTelemetry, mapRef, selectSession])

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
    await loadInitial()
    await loadOlderHistoryPages()
    if (useCenterScreenStore.getState().mode !== 'history') return
    const latest = getLatestSession(useHistoryStore.getState().sessions)
    if (latest) {
      await selectSession(latest)
    }
  }, [enterHistory, loadInitial, loadOlderHistoryPages, selectSession])

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
    if (mode === 'telemetry') enterMap()
  }, [enterMap, mode])

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

  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'history') {
          exitHistory()
          return true
        }
        if (mode === 'weather') {
          exitWeatherMode()
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
    }, [exitHistory, exitMapFocus, exitWeatherMode, mode]),
  )

  return {
    mode,
    liveLocations,
    latestApproximateLocation,
    blocks,
    historyActive,
    mapStyleKey,
    setMapStyleKey,
    mapNavigationMode,
    setMapNavigationMode,
    mapSelector,
    setMapSelector,
    dismissMapSelector,
    heading,
    setHeading,
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
    mediaHistory: {
      ...mediaHistory,
      toggle: () => {
        setOpenMediaAssetId(null)
        mediaHistory.toggle()
      },
    },
    openMediaAssetId,
    openMedia: (asset: MediaHistoryAsset) => setOpenMediaAssetId(asset.id),
    closeMedia: () => setOpenMediaAssetId(null),
    historyPreview,
    previousRide,
    nextRide,
    canPreviousRide,
    loadingSession,
    historyLoading,
    historyHasMore,
    historyError,
    historySheetVisible,
    setHistorySheetVisible,
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
    refreshWeather,
    handleMapFocus,
    exitMapFocus,
    seekGpsPosition,
    onSeek: setSeekTimeMs,
    activeHistoryMapMetric,
    setActiveHistoryMapMetric,
  }
}
