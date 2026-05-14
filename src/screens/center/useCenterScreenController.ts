import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { BackHandler, ToastAndroid } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

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
import { findNearestSampleIndexByTime } from '@/history/playback'

interface UseCenterScreenControllerArgs {
  mapRef: RefObject<CenterMapHandle | null>
}

export function useCenterScreenController({ mapRef }: UseCenterScreenControllerArgs) {
  const backPressedOnce = useRef(false)
  const [heading, setHeading] = useState(0)
  const {
    mode,
    historySheetVisible,
    mapStyleKey,
    rotationLocked,
    perspectiveEnabled,
    seekTimeMs,
    enterTelemetry,
    enterMap,
    enterHistory,
    setHistorySheetVisible,
    setMapStyleKey,
    setRotationLocked,
    setPerspectiveEnabled,
    setSeekTimeMs,
  } = useCenterScreenStore(
    useShallow((s) => ({
      mode: s.mode,
      historySheetVisible: s.historySheetVisible,
      mapStyleKey: s.mapStyleKey,
      rotationLocked: s.rotationLocked,
      perspectiveEnabled: s.perspectiveEnabled,
      seekTimeMs: s.seekTimeMs,
      enterTelemetry: s.enterTelemetry,
      enterMap: s.enterMap,
      enterHistory: s.enterHistory,
      setHistorySheetVisible: s.setHistorySheetVisible,
      setMapStyleKey: s.setMapStyleKey,
      setRotationLocked: s.setRotationLocked,
      setPerspectiveEnabled: s.setPerspectiveEnabled,
      setSeekTimeMs: s.setSeekTimeMs,
    })),
  )
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const {
    sessions,
    selectedSession,
    sessionSamples,
    sessionGpsSamples,
    sessionMarkers,
    loadingSession,
    loading: historyLoading,
    error: historyError,
    loadInitial,
    selectSession,
  } = useHistoryStore(
    useShallow((s) => ({
      sessions: s.sessions,
      selectedSession: s.selectedSession,
      sessionSamples: s.sessionSamples,
      sessionGpsSamples: s.sessionGpsSamples,
      sessionMarkers: s.sessionMarkers,
      loadingSession: s.loadingSession,
      loading: s.loading,
      error: s.error,
      loadInitial: s.loadInitial,
      selectSession: s.selectSession,
    })),
  )
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore(
    useShallow((s) => ({
      targetLocation: s.targetLocation,
      setTargetLocation: s.setTargetLocation,
      clearTargetLocation: s.clearTargetLocation,
    })),
  )

  useEffect(() => {
    setSeekTimeMs(null)
  }, [selectedSession, setSeekTimeMs])

  const seekGpsPosition = useMemo(() => {
    if (seekTimeMs == null || sessionGpsSamples.length === 0) return null
    const idx = findNearestSampleIndexByTime(sessionGpsSamples, seekTimeMs)
    return idx >= 0 ? sessionGpsSamples[idx] : null
  }, [seekTimeMs, sessionGpsSamples])

  const historyActive = mode === 'history' && !!selectedSession
  const previousRide = getPreviousRideSession(sessions, selectedSession)
  const nextRide = getNextRideSession(sessions, selectedSession)

  const exitMapFocus = useCallback(() => {
    enterTelemetry()
    mapRef.current?.recenterLive()
  }, [enterTelemetry, mapRef])

  const exitHistory = useCallback(() => {
    void selectSession(null)
    enterTelemetry()
    mapRef.current?.setPadding(0)
    requestAnimationFrame(() => mapRef.current?.recenterLive())
  }, [enterTelemetry, mapRef, selectSession])

  const enterHistoryMode = useCallback(async () => {
    await loadInitial()
    const latest = getLatestSession(useHistoryStore.getState().sessions)
    if (latest) {
      await selectSession(latest)
    }
    enterHistory()
  }, [enterHistory, loadInitial, selectSession])

  const selectRide = useCallback(
    (session: HistorySession) => {
      setHistorySheetVisible(false)
      void selectSession(session)
      enterHistory()
    },
    [enterHistory, selectSession, setHistorySheetVisible],
  )

  const handleMapFocus = useCallback(() => {
    if (mode === 'telemetry') enterMap()
  }, [enterMap, mode])

  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (mode === 'history') {
          exitHistory()
          return true
        }
        if (mode === 'map') {
          exitMapFocus()
          return true
        }
        if (backPressedOnce.current) {
          BackHandler.exitApp()
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
    }, [exitHistory, exitMapFocus, mode]),
  )

  return {
    mode,
    liveLocations,
    historyActive,
    mapStyleKey,
    setMapStyleKey,
    heading,
    setHeading,
    rotationLocked,
    setRotationLocked,
    perspectiveEnabled,
    setPerspectiveEnabled,
    targetLocation,
    setTargetLocation,
    clearTargetLocation,
    sessions,
    selectedSession,
    sessionSamples,
    sessionGpsSamples,
    sessionMarkers,
    previousRide,
    nextRide,
    loadingSession,
    historyLoading,
    historyError,
    historySheetVisible,
    setHistorySheetVisible,
    selectSession,
    enterHistoryMode,
    exitHistory,
    selectRide,
    handleMapFocus,
    exitMapFocus,
    seekGpsPosition,
    onSeek: setSeekTimeMs,
  }
}
