import type { Camera as CameraRef } from '@rnmapbox/maps'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useWindowDimensions } from 'react-native'

import { zoomLevelForDelta } from '@/helpers/mapGeometry'
import { MAP_DEFAULTS } from '@/modules/map/constants/mapStyles'
import {
  initialMapCameraControllerState,
  mapCameraModesEqual,
  reduceMapCameraIntent,
  type MapCameraMode,
} from '@/modules/map/lib/cameraController'
import {
  cameraDistanceTo,
  cameraMoveDuration,
  clamp,
  liveFollowKey,
  MIN_ZOOM,
  type CameraSnapshot,
  type HistoryPreviewTarget,
} from '@/modules/map/lib/cameraMotion'
import type { UseCameraControlsParams } from '@/screens/main/map/cameraControlTypes'
import { useCameraIntentCommands } from '@/screens/main/map/useCameraIntentCommands'
import { useCameraPreviewGestures } from '@/screens/main/map/useCameraPreviewGestures'
import { useHistoryCameraFraming } from '@/screens/main/map/useHistoryCameraFraming'

export type { CameraSnapshot, HistoryPreviewTarget }

export function useCameraControls({
  ref,
  cameraFix,
  persistedFallback,
  perspectiveEnabled,
  mapViewport,
  mapNavigationMode,
  heading,
  history,
  follow,
  getViewfinderCoordinateFromMap,
  onHeadingChange,
  onPerspectiveChange,
}: UseCameraControlsParams) {
  const { getFollowDeg, gpsMode, phoneMode, phoneReady, resetOnRecenter } = heading
  const {
    active: historyActive,
    preview: historyPreview,
    previewRoute: historyPreviewRoute,
    rideRoute,
    selectionKey: historySelectionKey,
  } = history
  const { animationDuration: followAnimationDuration, updatesEnabled: liveFollowUpdatesEnabled } =
    follow
  const cameraRef = useRef<CameraRef>(null)
  const currentCameraRef = useRef<CameraSnapshot | null>(null)
  const historyPreviewTargetRef = useRef<HistoryPreviewTarget | null>(null)
  const lastFollowKeyRef = useRef<string | null>(null)
  const followZoomLevelRef = useRef<number | null>(null)
  const previousGpsHeadingModeRef = useRef(gpsMode && !phoneMode)
  const phoneHeadingCameraSuspensionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recenterLiveRef = useRef<
    ((options?: { resetPadding?: boolean; animationDuration?: number }) => void) | null
  >(null)
  const controllerStateRef = useRef(initialMapCameraControllerState)
  const cameraRefs = useMemo(
    () => ({
      cameraRef,
      currentCameraRef,
      controllerStateRef,
      followZoomLevelRef,
      historyPreviewTargetRef,
      lastFollowKeyRef,
    }),
    [],
  )
  const [cameraMode, setCameraModeRaw] = useState<MapCameraMode>({ kind: 'liveFollow' })
  const [phoneHeadingCameraSuspended, setPhoneHeadingCameraSuspended] = useState(false)
  const { width: windowWidth, height: viewportHeight } = useWindowDimensions()
  const historyViewport = useMemo(
    () =>
      mapViewport.width > 0 && mapViewport.height > 0
        ? mapViewport
        : { width: windowWidth, height: viewportHeight },
    [mapViewport, viewportHeight, windowWidth],
  )

  // Reducer intents return fresh mode objects even when logically unchanged.
  // Keep previous state reference so per-frame BrowseManually can bail out.
  const setCameraModeState = useCallback((mode: MapCameraMode) => {
    setCameraModeRaw((previous) => (mapCameraModesEqual(previous, mode) ? previous : mode))
  }, [])

  const setCameraModeRef = useCallback((mode: MapCameraMode) => {
    controllerStateRef.current = { ...controllerStateRef.current, mode }
  }, [])

  const enterCameraMode = useCallback(
    (mode: MapCameraMode) => {
      controllerStateRef.current = { ...controllerStateRef.current, mode }
      setCameraModeState(mode)
    },
    [setCameraModeState],
  )

  const dispatchCameraIntent = useCallback(
    (intent: Parameters<typeof reduceMapCameraIntent>[1]) => {
      const result = reduceMapCameraIntent(controllerStateRef.current, intent)
      controllerStateRef.current = result.state
      setCameraModeState(result.state.mode)
      return result.effect
    },
    [setCameraModeState],
  )

  const suspendPhoneHeadingCamera = useCallback(
    (animationDuration: number) => {
      if (!phoneMode) return
      if (phoneHeadingCameraSuspensionTimeoutRef.current) {
        clearTimeout(phoneHeadingCameraSuspensionTimeoutRef.current)
        phoneHeadingCameraSuspensionTimeoutRef.current = null
      }
      if (animationDuration <= 0) {
        setPhoneHeadingCameraSuspended(false)
        return
      }
      setPhoneHeadingCameraSuspended(true)
      phoneHeadingCameraSuspensionTimeoutRef.current = setTimeout(() => {
        phoneHeadingCameraSuspensionTimeoutRef.current = null
        setPhoneHeadingCameraSuspended(false)
      }, animationDuration)
    },
    [phoneMode],
  )

  const setFollowGps = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        lastFollowKeyRef.current = null
        enterCameraMode({ kind: 'liveFollow' })
        return
      }
      dispatchCameraIntent({
        type: 'BrowseManually',
        historySelectionKey: historyActive ? (historyPreview?.key ?? null) : undefined,
      })
    },
    [dispatchCameraIntent, enterCameraMode, historyActive, historyPreview?.key],
  )

  const setFollowZoomLevel = useCallback((zoomLevel: number) => {
    const clampedZoomLevel = clamp(zoomLevel, MIN_ZOOM, MAP_DEFAULTS.maxZoom)
    followZoomLevelRef.current = clampedZoomLevel
    controllerStateRef.current = {
      ...controllerStateRef.current,
      followZoomLevel: clampedZoomLevel,
    }
    lastFollowKeyRef.current = null
  }, [])

  const stopCameraAnimation = useCallback(() => {
    setFollowGps(false)
    const current = currentCameraRef.current
    if (!current) return
    cameraRef.current?.setCamera({ ...current, animationDuration: 0 })
  }, [setFollowGps])

  const gpsCamera = useMemo(() => {
    if (!cameraFix) {
      return {
        centerCoordinate: persistedFallback ?? MAP_DEFAULTS.fallbackCoordinate,
        zoomLevel:
          persistedFallback == null
            ? MAP_DEFAULTS.fallbackZoom
            : MAP_DEFAULTS.persistedGpsFallbackZoom,
      }
    }
    const baseDelta =
      cameraFix.accuracyM != null
        ? Math.max(MAP_DEFAULTS.zoomDeltaMinAccuracy, cameraFix.accuracyM / 111_000)
        : MAP_DEFAULTS.zoomDeltaFallback
    return {
      centerCoordinate: [cameraFix.longitude, cameraFix.latitude] as [number, number],
      zoomLevel: zoomLevelForDelta(baseDelta * MAP_DEFAULTS.zoomDeltaMultiplier),
    }
  }, [cameraFix, persistedFallback])

  const followGps = cameraMode.kind === 'liveFollow'
  const getLiveFollowCamera = useCallback(() => {
    const baseZoomLevel = followZoomLevelRef.current ?? gpsCamera.zoomLevel
    const manualFollowZoom = followZoomLevelRef.current != null
    const effectiveNavigationMode =
      mapNavigationMode === 'phoneHeading' && !phoneReady ? 'freeRotate' : mapNavigationMode
    const effect = reduceMapCameraIntent(controllerStateRef.current, {
      type: 'FollowLive',
      gpsCamera: { ...gpsCamera, zoomLevel: baseZoomLevel },
      followHeadingDeg: getFollowDeg(),
      navigationMode: effectiveNavigationMode,
      perspectiveEnabled,
      viewportHeight,
      preserveHeading: resetOnRecenter ? undefined : currentCameraRef.current?.heading,
      enforceMinimums: !manualFollowZoom,
    }).effect
    const followCamera = effect?.camera as CameraSnapshot
    if (resetOnRecenter) return followCamera
    return {
      ...followCamera,
      heading: currentCameraRef.current?.heading ?? followCamera.heading,
    }
  }, [
    gpsCamera,
    getFollowDeg,
    mapNavigationMode,
    phoneReady,
    perspectiveEnabled,
    resetOnRecenter,
    viewportHeight,
  ])

  const applyLiveFollowCamera = useCallback(
    (animationDuration: number) => {
      if (!cameraFix) return
      const followCamera = getLiveFollowCamera()
      lastFollowKeyRef.current = liveFollowKey(cameraFix.timestamp, followCamera)
      currentCameraRef.current = followCamera
      cameraRef.current?.setCamera({
        ...followCamera,
        animationDuration,
        animationMode: 'easeTo',
      })
    },
    [cameraFix, getLiveFollowCamera],
  )

  const recenterLive = useCallback(
    (options?: { resetPadding?: boolean; animationDuration?: number }) => {
      enterCameraMode({ kind: 'liveFollow' })
      if (!cameraFix) return
      const followCamera = getLiveFollowCamera()
      lastFollowKeyRef.current = liveFollowKey(cameraFix.timestamp, followCamera)
      const duration =
        options?.animationDuration ??
        cameraMoveDuration(
          cameraDistanceTo(currentCameraRef.current, cameraFix),
          MAP_DEFAULTS.animationDuration,
        )
      suspendPhoneHeadingCamera(duration)
      currentCameraRef.current = followCamera
      cameraRef.current?.setCamera({
        ...followCamera,
        ...(options?.resetPadding
          ? {
              padding: followCamera.padding ?? {
                paddingBottom: 0,
                paddingTop: 0,
                paddingLeft: 0,
                paddingRight: 0,
              },
            }
          : {}),
        animationDuration: duration,
        animationMode: 'easeTo',
      })
      onHeadingChange(followCamera.heading)
    },
    [cameraFix, enterCameraMode, getLiveFollowCamera, onHeadingChange, suspendPhoneHeadingCamera],
  )

  useEffect(() => {
    recenterLiveRef.current = recenterLive
  }, [recenterLive])
  useEffect(
    () => () => {
      if (phoneHeadingCameraSuspensionTimeoutRef.current) {
        clearTimeout(phoneHeadingCameraSuspensionTimeoutRef.current)
      }
    },
    [],
  )

  const { getHistoryPreviewCamera, previewHistorySession } = useHistoryCameraFraming({
    cameraRefs,
    active: historyActive,
    selectionKey: historySelectionKey,
    preview: historyPreview,
    previewRoute: historyPreviewRoute,
    rideRoute,
    viewport: historyViewport,
    perspectiveEnabled,
    dispatchCameraIntent,
    setCameraModeRef,
    onHeadingChange,
  })
  const previewGestures = useCameraPreviewGestures({
    cameraRefs,
    cameraFix,
    followGps,
    gpsCamera,
    gpsHeadingMode: gpsMode,
    historyActive,
    perspectiveEnabled,
    applyLiveFollowCamera,
    enterCameraMode,
    getFollowHeadingDeg: getFollowDeg,
    getLiveFollowCamera,
    setFollowGps,
    setFollowZoomLevel,
    suspendPhoneHeadingCamera,
  })
  const intentCommands = useCameraIntentCommands({
    cameraRefs,
    gpsCamera,
    mapNavigationMode,
    perspectiveEnabled,
    dispatchCameraIntent,
    getFollowHeadingDeg: getFollowDeg,
    setFollowGps,
    onHeadingChange,
    onPerspectiveChange,
  })

  const imperativeHandleLatest = {
    getViewfinderCoordinateFromMap,
    gpsCamera,
    intentCommands,
    previewGestures,
    previewHistorySession,
    recenterLive,
  }
  const imperativeHandleLatestRef = useRef(imperativeHandleLatest)
  useLayoutEffect(() => {
    imperativeHandleLatestRef.current = imperativeHandleLatest
  })
  useImperativeHandle(
    ref,
    () => ({
      recenterLive(options?: { resetPadding?: boolean; animationDuration?: number }) {
        imperativeHandleLatestRef.current.recenterLive(options)
      },
      previewHistorySession(preview: HistoryPreviewTarget) {
        imperativeHandleLatestRef.current.previewHistorySession(preview)
      },
      beginPreviewPan() {
        imperativeHandleLatestRef.current.previewGestures.beginPreviewPan()
      },
      previewPanBy(...args: [number, number, number?, number?]) {
        imperativeHandleLatestRef.current.previewGestures.previewPanBy(...args)
      },
      endPreviewPan() {
        imperativeHandleLatestRef.current.previewGestures.endPreviewPan()
      },
      beginPreviewZoom() {
        imperativeHandleLatestRef.current.previewGestures.beginPreviewZoom()
      },
      previewZoomBy(scale: number) {
        imperativeHandleLatestRef.current.previewGestures.previewZoomBy(scale)
      },
      endPreviewZoom() {
        imperativeHandleLatestRef.current.previewGestures.endPreviewZoom()
      },
      restorePreviewPan() {
        imperativeHandleLatestRef.current.previewGestures.restorePreviewPan()
      },
      async getViewfinderCoordinate() {
        const { getViewfinderCoordinateFromMap, gpsCamera } = imperativeHandleLatestRef.current
        const coordinate = await getViewfinderCoordinateFromMap?.()
        if (coordinate) return coordinate
        const center = currentCameraRef.current?.centerCoordinate ?? gpsCamera.centerCoordinate
        return { longitude: center[0], latitude: center[1] }
      },
      resetRotation() {
        imperativeHandleLatestRef.current.intentCommands.resetRotation()
      },
      togglePerspective() {
        imperativeHandleLatestRef.current.intentCommands.togglePerspective()
      },
      setPadding(bottom: number) {
        imperativeHandleLatestRef.current.intentCommands.setPadding(bottom)
      },
      zoomBy(delta: number) {
        imperativeHandleLatestRef.current.intentCommands.zoomBy(delta)
      },
      focusCoordinate(coordinate: [number, number]) {
        imperativeHandleLatestRef.current.intentCommands.focusCoordinate(coordinate)
      },
      centerCoordinatePreservingCamera(coordinate: [number, number]) {
        imperativeHandleLatestRef.current.intentCommands.centerCoordinatePreservingCamera(
          coordinate,
        )
      },
      focusWeather() {
        imperativeHandleLatestRef.current.intentCommands.focusWeather()
      },
      focusLegalLimits() {
        imperativeHandleLatestRef.current.intentCommands.focusLegalLimits()
      },
    }),
    [],
  )

  useEffect(() => {
    if (
      !cameraFix ||
      !followGps ||
      historyActive ||
      !liveFollowUpdatesEnabled ||
      previewGestures.previewPanActiveRef.current ||
      controllerStateRef.current.mode.kind !== 'liveFollow'
    )
      return
    historyPreviewTargetRef.current = null
    const followCamera = getLiveFollowCamera()
    const nextFollowKey = liveFollowKey(cameraFix.timestamp, followCamera)
    if (lastFollowKeyRef.current === nextFollowKey) return
    applyLiveFollowCamera(
      cameraMoveDuration(
        cameraDistanceTo(currentCameraRef.current, cameraFix),
        followAnimationDuration,
      ),
    )
  }, [
    applyLiveFollowCamera,
    cameraFix,
    followAnimationDuration,
    followGps,
    getLiveFollowCamera,
    historyActive,
    liveFollowUpdatesEnabled,
    previewGestures.previewPanActiveRef,
  ])

  useEffect(() => {
    const actualGpsHeadingMode = gpsMode && !phoneMode
    const wasGpsHeadingMode = previousGpsHeadingModeRef.current
    previousGpsHeadingModeRef.current = actualGpsHeadingMode
    if (historyActive) return

    if (!actualGpsHeadingMode && wasGpsHeadingMode) {
      followZoomLevelRef.current = null
      lastFollowKeyRef.current = null
      const frame = requestAnimationFrame(() => recenterLiveRef.current?.({ resetPadding: true }))
      return () => cancelAnimationFrame(frame)
    }
    if (!actualGpsHeadingMode) return
    const frame = requestAnimationFrame(() =>
      recenterLiveRef.current?.({ resetPadding: true, animationDuration: 0 }),
    )
    return () => cancelAnimationFrame(frame)
  }, [gpsMode, historyActive, phoneMode])

  return {
    cameraRef,
    currentCameraRef,
    gpsCamera,
    followGps,
    setFollowGps,
    stopCameraAnimation,
    setFollowZoomLevel,
    recenterLive,
    getLiveFollowCamera,
    getHistoryPreviewCamera,
    phoneHeadingCameraSuspended,
  }
}
