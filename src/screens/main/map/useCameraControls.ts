import type { Camera as CameraRef } from '@rnmapbox/maps'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Dimensions } from 'react-native'

import { MAP_DEFAULTS } from '@/modules/map/constants/mapStyles'
import type { MapNavigationMode } from '@/modules/map/constants/mapStyles'
import { distanceMeters, zoomLevelForDelta } from '@/helpers/mapGeometry'
import { LEGAL_LIMIT_MAP_CAMERA } from '@/modules/legal/lib/legalLimits'
import {
  initialMapCameraControllerState,
  mapCameraModesEqual,
  reduceMapCameraIntent,
  type MapCameraMode,
} from '@/modules/map/lib/cameraController'
import { getMapRevealPitch, getPitchForZoom } from '@/modules/map/lib/cameraProfiles'
import { getCameraAfterScreenDrag } from '@/modules/map/lib/cameraPanProjection'
import { getHistoryRouteCamera, type HistoryCameraViewport } from '@/modules/map/lib/historyCamera'

import {
  HISTORY_BUCKET_PREVIEW_ZOOM_OUT_DELTA,
  HISTORY_ROUTE_REFINEMENT_DURATION_MS,
  INSTANT_JUMP_DISTANCE_M,
  MAP_REVEAL_ZOOM_OUT_DELTA,
  MIN_ZOOM,
  cameraDistanceTo,
  cameraMoveDuration,
  clamp,
  getHistoryPreviewBounds,
  getHistoryPreviewZoom,
  historyBucketPreviewDuration,
  historyMoveDuration,
  liveFollowKey,
  type CameraSnapshot,
  type HistoryPreviewTarget,
} from '@/modules/map/lib/cameraMotion'

export type { CameraSnapshot, HistoryPreviewTarget }

interface GpsFix {
  latitude: number
  longitude: number
  timestamp: number
  accuracyM?: number | null
}

interface UseCameraControlsParams {
  ref: React.ForwardedRef<any>
  cameraFix: GpsFix | null
  persistedFallback: [number, number] | null
  perspectiveEnabled: boolean
  historyActive: boolean
  historySelectionKey: string | null
  historyPreview: ({ key: string } & HistoryPreviewTarget) | null
  historyPreviewRoute: [number, number][]
  rideRoute: [number, number][]
  mapViewport: HistoryCameraViewport
  mapNavigationMode: MapNavigationMode
  gpsHeadingMode: boolean
  phoneHeadingMode: boolean
  phoneHeadingReady: boolean
  getFollowHeadingDeg: () => number
  resetHeadingOnRecenter: boolean
  liveFollowUpdatesEnabled: boolean
  followAnimationDuration: number
  getViewfinderCoordinateFromMap?: () => Promise<{ latitude: number; longitude: number } | null>
  onHeadingChange: (heading: number) => void
  onPerspectiveChange: (enabled: boolean) => void
}

export function useCameraControls({
  ref,
  cameraFix,
  persistedFallback,
  perspectiveEnabled,
  historyActive,
  historySelectionKey,
  historyPreview,
  historyPreviewRoute,
  rideRoute,
  mapViewport,
  mapNavigationMode,
  gpsHeadingMode,
  phoneHeadingMode,
  phoneHeadingReady,
  getFollowHeadingDeg,
  resetHeadingOnRecenter,
  liveFollowUpdatesEnabled,
  followAnimationDuration,
  getViewfinderCoordinateFromMap,
  onHeadingChange,
  onPerspectiveChange,
}: UseCameraControlsParams) {
  const cameraRef = useRef<CameraRef>(null)
  const previewPanBaseRef = useRef<CameraSnapshot | null>(null)
  const previewPanCameraRef = useRef<CameraSnapshot | null>(null)
  const previewZoomBaseRef = useRef<CameraSnapshot | null>(null)
  const previewPanActiveRef = useRef(false)
  const currentCameraRef = useRef<CameraSnapshot | null>(null)
  const historyPreviewTargetRef = useRef<HistoryPreviewTarget | null>(null)
  const lastFollowKeyRef = useRef<string | null>(null)
  const followZoomLevelRef = useRef<number | null>(null)
  const previousGpsHeadingModeRef = useRef(gpsHeadingMode && !phoneHeadingMode)
  const phoneHeadingCameraSuspensionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recenterLiveRef = useRef<
    ((options?: { resetPadding?: boolean; animationDuration?: number }) => void) | null
  >(null)
  const controllerStateRef = useRef(initialMapCameraControllerState)
  const [cameraMode, setCameraModeRaw] = useState<MapCameraMode>({ kind: 'liveFollow' })
  const [phoneHeadingCameraSuspended, setPhoneHeadingCameraSuspended] = useState(false)
  // Reducer intents return fresh mode objects even when the logical mode is
  // unchanged (e.g. per-frame BrowseManually during pan) — keep the previous
  // state reference in that case so React bails out of the re-render.
  const setCameraModeState = useCallback((mode: MapCameraMode) => {
    setCameraModeRaw((previous) => (mapCameraModesEqual(previous, mode) ? previous : mode))
  }, [])
  const followGps = cameraMode.kind === 'liveFollow'
  const windowSize = Dimensions.get('window')
  const viewportHeight = windowSize.height
  const historyViewport = useMemo(
    () =>
      mapViewport.width > 0 && mapViewport.height > 0
        ? mapViewport
        : { width: windowSize.width, height: windowSize.height },
    [mapViewport, windowSize.height, windowSize.width],
  )

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
      if (!phoneHeadingMode) return
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
    [phoneHeadingMode],
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
    cameraRef.current?.setCamera({
      ...current,
      animationDuration: 0,
    })
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

  const getLiveFollowCamera = useCallback(() => {
    const baseZoomLevel = followZoomLevelRef.current ?? gpsCamera.zoomLevel
    const manualFollowZoom = followZoomLevelRef.current != null
    const effectiveNavigationMode =
      mapNavigationMode === 'phoneHeading' && !phoneHeadingReady ? 'freeRotate' : mapNavigationMode
    const effect = reduceMapCameraIntent(controllerStateRef.current, {
      type: 'FollowLive',
      gpsCamera: { ...gpsCamera, zoomLevel: baseZoomLevel },
      followHeadingDeg: getFollowHeadingDeg(),
      navigationMode: effectiveNavigationMode,
      perspectiveEnabled,
      viewportHeight,
      preserveHeading: resetHeadingOnRecenter ? undefined : currentCameraRef.current?.heading,
      enforceMinimums: !manualFollowZoom,
    }).effect
    const followCamera = effect?.camera as CameraSnapshot
    if (resetHeadingOnRecenter) return followCamera
    return {
      ...followCamera,
      heading: currentCameraRef.current?.heading ?? followCamera.heading,
    }
  }, [
    getFollowHeadingDeg,
    gpsCamera,
    mapNavigationMode,
    perspectiveEnabled,
    phoneHeadingReady,
    resetHeadingOnRecenter,
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

  const getHistoryPreviewCamera = useCallback(
    (coordinate: { latitude: number; longitude: number }) => {
      const camera = getHistoryRouteCamera({
        route: [[coordinate.longitude, coordinate.latitude]],
        viewport: historyViewport,
        maxZoom: MAP_DEFAULTS.maxZoom,
      })
      const zoomLevel = getHistoryPreviewZoom(
        camera?.zoomLevel ?? MAP_DEFAULTS.persistedGpsFallbackZoom,
      )
      return {
        centerCoordinate:
          camera?.centerCoordinate ??
          ([coordinate.longitude, coordinate.latitude] as [number, number]),
        zoomLevel,
        heading: 0,
        pitch: getPitchForZoom(zoomLevel, perspectiveEnabled),
        padding: camera?.padding,
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo' as const,
      }
    },
    [historyViewport, perspectiveEnabled],
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

  const fitRide = useCallback(
    (selectionKey: string | null) => {
      const historyCamera = getHistoryRouteCamera({
        route: rideRoute,
        viewport: historyViewport,
        maxZoom: MAP_DEFAULTS.maxZoom,
      })
      if (!historyCamera) return
      const routeCenter = {
        longitude: historyCamera.centerCoordinate[0],
        latitude: historyCamera.centerCoordinate[1],
      }
      const duration =
        cameraDistanceTo(currentCameraRef.current, routeCenter) > INSTANT_JUMP_DISTANCE_M
          ? 0
          : HISTORY_ROUTE_REFINEMENT_DURATION_MS
      const effect = dispatchCameraIntent({
        type: 'RefineRideHistoryRoute',
        selectionKey,
        camera: {
          ...historyCamera,
          heading: 0,
          pitch: getPitchForZoom(historyCamera.zoomLevel, perspectiveEnabled),
        },
      })
      if (!effect) return
      cameraRef.current?.setCamera({
        ...effect.camera,
        animationDuration: duration,
        animationMode: 'easeTo',
      })
      onHeadingChange(0)
    },
    [dispatchCameraIntent, historyViewport, onHeadingChange, perspectiveEnabled, rideRoute],
  )

  const previewHistorySession = useCallback(
    (preview: HistoryPreviewTarget & { key?: string }) => {
      const lastTarget = historyPreviewTargetRef.current
      historyPreviewTargetRef.current = preview
      const currentCamera = currentCameraRef.current
      const currentDistanceM = cameraDistanceTo(currentCamera, preview)
      const lastTargetDistanceM = lastTarget
        ? distanceMeters(lastTarget, preview)
        : currentDistanceM
      const duration = historyMoveDuration(Math.max(currentDistanceM, lastTargetDistanceM))
      const bounds = getHistoryPreviewBounds(preview)
      if (bounds) {
        const historyCamera = getHistoryRouteCamera({
          route: [bounds.ne, bounds.sw],
          viewport: historyViewport,
          maxZoom: MAP_DEFAULTS.maxZoom,
        })
        if (historyCamera) {
          const zoomLevel = getHistoryPreviewZoom(historyCamera.zoomLevel)
          const effect = dispatchCameraIntent({
            type: 'FrameRideHistoryPreview',
            selectionKey: preview.key ?? null,
            camera: {
              ...historyCamera,
              zoomLevel,
              heading: 0,
              pitch: getPitchForZoom(zoomLevel, perspectiveEnabled),
            },
          })
          if (!effect) return
          cameraRef.current?.setCamera({
            ...effect.camera,
            animationDuration: duration,
            animationMode: 'easeTo',
          })
        }
      } else {
        const previewCamera = getHistoryPreviewCamera(preview)
        const effect = dispatchCameraIntent({
          type: 'FrameRideHistoryPreview',
          selectionKey: preview.key ?? null,
          camera: previewCamera,
        })
        if (!effect) return
        cameraRef.current?.setCamera({
          ...effect.camera,
          animationDuration: duration,
        })
      }
      onHeadingChange(0)
    },
    [
      dispatchCameraIntent,
      getHistoryPreviewCamera,
      historyViewport,
      onHeadingChange,
      perspectiveEnabled,
    ],
  )

  const previewHistoryRoute = useCallback(
    (selectionKey: string, route: [number, number][]) => {
      const historyCamera = getHistoryRouteCamera({
        route,
        viewport: historyViewport,
        maxZoom: MAP_DEFAULTS.maxZoom,
      })
      if (!historyCamera) return
      const zoomLevel = clamp(
        historyCamera.zoomLevel - HISTORY_BUCKET_PREVIEW_ZOOM_OUT_DELTA,
        MIN_ZOOM,
        MAP_DEFAULTS.maxZoom,
      )
      const routeCenter = {
        longitude: historyCamera.centerCoordinate[0],
        latitude: historyCamera.centerCoordinate[1],
      }
      const effect = dispatchCameraIntent({
        type: 'FrameRideHistoryPreview',
        selectionKey,
        camera: {
          ...historyCamera,
          zoomLevel,
          heading: 0,
          pitch: getPitchForZoom(zoomLevel, perspectiveEnabled),
        },
      })
      if (!effect) return
      cameraRef.current?.setCamera({
        ...effect.camera,
        animationDuration: historyBucketPreviewDuration(
          cameraDistanceTo(currentCameraRef.current, routeCenter),
        ),
        animationMode: 'easeTo',
      })
      onHeadingChange(0)
    },
    [dispatchCameraIntent, historyViewport, onHeadingChange, perspectiveEnabled],
  )

  const restorePreviewPan = useCallback(() => {
    previewPanActiveRef.current = false
    enterCameraMode({ kind: 'liveFollow' })
    const restoreCamera = previewPanBaseRef.current ?? getLiveFollowCamera()
    previewPanBaseRef.current = null
    previewPanCameraRef.current = null
    if (cameraFix) {
      lastFollowKeyRef.current = liveFollowKey(cameraFix.timestamp, restoreCamera)
    }
    const duration = cameraMoveDuration(
      cameraDistanceTo(currentCameraRef.current, {
        longitude: restoreCamera.centerCoordinate[0],
        latitude: restoreCamera.centerCoordinate[1],
      }),
      MAP_DEFAULTS.followAnimationDuration,
    )
    suspendPhoneHeadingCamera(duration)
    cameraRef.current?.setCamera({
      ...restoreCamera,
      heading: restoreCamera.heading,
      pitch: restoreCamera.pitch,
      animationDuration: duration,
      animationMode: 'easeTo',
    })
  }, [cameraFix, enterCameraMode, getLiveFollowCamera, suspendPhoneHeadingCamera])

  const setFreeMapZoom = useCallback(
    (zoomLevel: number) => {
      setFollowGps(false)
      const current = currentCameraRef.current
      cameraRef.current?.setCamera({
        ...(current ? { centerCoordinate: current.centerCoordinate } : {}),
        zoomLevel,
        pitch: getPitchForZoom(zoomLevel, perspectiveEnabled),
        animationDuration: MAP_DEFAULTS.animationDuration,
        animationMode: 'easeTo',
      })
    },
    [perspectiveEnabled, setFollowGps],
  )

  useImperativeHandle(
    ref,
    () => ({
      recenterLive,
      previewHistorySession,
      beginPreviewPan() {
        previewPanActiveRef.current = true
        previewPanCameraRef.current = null
        const baseCamera =
          followGps && !historyActive
            ? getLiveFollowCamera()
            : (currentCameraRef.current ?? {
                ...gpsCamera,
                heading: getFollowHeadingDeg(),
                pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
              })
        previewPanBaseRef.current =
          followGps && gpsHeadingMode
            ? {
                ...baseCamera,
                heading: getFollowHeadingDeg(),
              }
            : baseCamera
        setFollowGps(false)
      },
      previewPanBy(deltaX: number, deltaY: number, animationDuration = 0, revealProgress = 0) {
        setFollowGps(false)
        const baseCamera = previewPanBaseRef.current
        if (!baseCamera) return
        const zoomLevel = clamp(
          baseCamera.zoomLevel - MAP_REVEAL_ZOOM_OUT_DELTA * revealProgress,
          MIN_ZOOM,
          MAP_DEFAULTS.maxZoom,
        )
        const previewCamera = {
          ...getCameraAfterScreenDrag(baseCamera, deltaX, deltaY),
          zoomLevel,
          pitch: getMapRevealPitch({
            basePitch: baseCamera.pitch,
            zoom: zoomLevel,
            revealProgress,
            perspectiveEnabled,
          }),
        }
        previewPanCameraRef.current = previewCamera
        currentCameraRef.current = previewCamera
        cameraRef.current?.setCamera({
          ...previewCamera,
          animationMode: 'linearTo',
          animationDuration,
        })
      },
      endPreviewPan() {
        setFollowGps(false)
        previewPanActiveRef.current = false
        previewPanBaseRef.current = null
        previewPanCameraRef.current = null
      },
      beginPreviewZoom() {
        previewZoomBaseRef.current =
          followGps && !historyActive ? getLiveFollowCamera() : currentCameraRef.current
      },
      previewZoomBy(scale: number) {
        const baseCamera = previewZoomBaseRef.current
        if (!baseCamera || scale <= 0) return
        const zoomLevel = clamp(
          baseCamera.zoomLevel + Math.log2(scale),
          MIN_ZOOM,
          MAP_DEFAULTS.maxZoom,
        )
        setFollowZoomLevel(zoomLevel)
        if (followGps && !historyActive) {
          applyLiveFollowCamera(0)
        }
      },
      endPreviewZoom() {
        previewZoomBaseRef.current = null
      },
      restorePreviewPan,
      async getViewfinderCoordinate() {
        const viewfinderCoordinate = await getViewfinderCoordinateFromMap?.()
        if (viewfinderCoordinate) return viewfinderCoordinate
        const center = currentCameraRef.current?.centerCoordinate ?? gpsCamera.centerCoordinate
        return { longitude: center[0], latitude: center[1] }
      },
      resetRotation() {
        followZoomLevelRef.current = null
        cameraRef.current?.setCamera({
          heading: 0,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
        onHeadingChange(0)
      },
      togglePerspective() {
        const enabled = !perspectiveEnabled
        onPerspectiveChange(enabled)
        const effect = dispatchCameraIntent({
          type: 'ChangePerspective',
          enabled,
          currentCamera: currentCameraRef.current,
          fallbackZoomLevel: gpsCamera.zoomLevel,
          navigationMode: mapNavigationMode,
        })
        cameraRef.current?.setCamera({
          ...effect?.camera,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
      setPadding(bottom: number) {
        cameraRef.current?.setCamera({
          padding: { paddingBottom: bottom, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
          animationDuration: bottom === 0 ? 0 : 300,
          animationMode: 'easeTo',
        })
      },
      zoomBy(delta: number) {
        setFreeMapZoom(
          clamp(
            (currentCameraRef.current?.zoomLevel ?? gpsCamera.zoomLevel) + delta,
            MIN_ZOOM,
            MAP_DEFAULTS.maxZoom,
          ),
        )
      },
      focusCoordinate(coordinate: [number, number]) {
        const effect = dispatchCameraIntent({
          type: 'FocusCoordinate',
          coordinate,
          currentCamera: currentCameraRef.current,
          fallbackZoomLevel: gpsCamera.zoomLevel,
          navigationMode: mapNavigationMode,
          perspectiveEnabled,
        })
        const current = currentCameraRef.current
        cameraRef.current?.setCamera({
          ...effect?.camera,
          zoomLevel: effect?.camera.zoomLevel ?? current?.zoomLevel,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
      centerCoordinatePreservingCamera(coordinate: [number, number]) {
        setFollowGps(false)
        const current = currentCameraRef.current
        const camera = {
          centerCoordinate: coordinate,
          zoomLevel: current?.zoomLevel ?? gpsCamera.zoomLevel,
          heading: current?.heading ?? getFollowHeadingDeg(),
          pitch: current?.pitch ?? getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
          padding: { paddingBottom: 0, paddingTop: 0, paddingLeft: 0, paddingRight: 0 },
        }
        currentCameraRef.current = camera
        cameraRef.current?.setCamera({
          ...camera,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
      focusWeather() {
        const effect = dispatchCameraIntent({
          type: 'EnterWeatherView',
          currentCamera: currentCameraRef.current,
          fallbackCenterCoordinate: gpsCamera.centerCoordinate,
          perspectiveEnabled,
        })
        cameraRef.current?.setCamera({
          ...effect?.camera,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
      focusLegalLimits() {
        const effect = dispatchCameraIntent({
          type: 'EnterLegalLimitsView',
          camera: LEGAL_LIMIT_MAP_CAMERA,
        })
        cameraRef.current?.setCamera({
          ...effect?.camera,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
    }),
    [
      applyLiveFollowCamera,
      dispatchCameraIntent,
      followGps,
      getFollowHeadingDeg,
      getLiveFollowCamera,
      getViewfinderCoordinateFromMap,
      gpsCamera,
      gpsHeadingMode,
      historyActive,
      mapNavigationMode,
      onHeadingChange,
      onPerspectiveChange,
      perspectiveEnabled,
      previewHistorySession,
      recenterLive,
      restorePreviewPan,
      setFreeMapZoom,
      setFollowGps,
      setFollowZoomLevel,
    ],
  )

  useEffect(() => {
    if (
      !cameraFix ||
      !followGps ||
      historyActive ||
      !liveFollowUpdatesEnabled ||
      previewPanActiveRef.current ||
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
  ])

  useEffect(() => {
    const actualGpsHeadingMode = gpsHeadingMode && !phoneHeadingMode
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
  }, [gpsHeadingMode, historyActive, phoneHeadingMode])

  useEffect(() => {
    if (!historyActive || !historySelectionKey) return

    const mode = controllerStateRef.current.mode
    if (mode.kind !== 'rideHistory' || mode.selectionKey !== historySelectionKey) {
      setCameraModeRef({
        kind: 'rideHistory',
        selectionKey: historySelectionKey,
        phase: 'preview',
      })
    }

    const frame = requestAnimationFrame(() => {
      if (rideRoute.length > 0) {
        historyPreviewTargetRef.current = null
        fitRide(historySelectionKey)
        return
      }
      if (historyPreviewRoute.length > 0) {
        previewHistoryRoute(historySelectionKey, historyPreviewRoute)
        return
      }
      if (historyPreview?.key === historySelectionKey) {
        previewHistorySession(historyPreview)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [
    fitRide,
    historyActive,
    historyPreview,
    historyPreviewRoute,
    historySelectionKey,
    previewHistoryRoute,
    previewHistorySession,
    rideRoute,
    setCameraModeRef,
  ])

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
