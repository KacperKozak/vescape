import type { Camera as CameraRef } from '@rnmapbox/maps'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Dimensions } from 'react-native'

import { MAP_DEFAULTS } from '@/constants/mapStyles'
import type { MapNavigationMode } from '@/constants/mapStyles'
import { distanceMeters, zoomLevelForDelta } from '@/helpers/mapGeometry'
import {
  initialMapCameraControllerState,
  reduceMapCameraIntent,
  type MapCameraMode,
} from '@/lib/map/cameraController'
import { getLiveFollowCameraProfile, getPitchForZoom } from '@/screens/center/cameraFollowProfile'
import { getCameraAfterScreenDrag } from '@/screens/center/cameraPanProjection'
import { getHistoryRouteCamera, type HistoryCameraViewport } from '@/screens/center/historyCamera'

const MIN_ZOOM = 0
const MAP_REVEAL_ZOOM_OUT_DELTA = 0.65
const HISTORY_PREVIEW_ZOOM_OUT_DELTA = 0.8
const HISTORY_DYNAMIC_FULL_DISTANCE_M = 80_000
const HISTORY_DYNAMIC_MAX_EXTRA_DURATION_MS = 450
const INSTANT_JUMP_DISTANCE_M = 10_000

export interface CameraSnapshot {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
  padding?: {
    paddingTop: number
    paddingRight: number
    paddingBottom: number
    paddingLeft: number
  }
}

export interface HistoryPreviewTarget {
  latitude: number
  longitude: number
  minLatitude: number | null
  maxLatitude: number | null
  minLongitude: number | null
  maxLongitude: number | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getHistoryPreviewBounds(preview: HistoryPreviewTarget) {
  if (
    preview.minLatitude == null ||
    preview.maxLatitude == null ||
    preview.minLongitude == null ||
    preview.maxLongitude == null ||
    (preview.minLatitude === preview.maxLatitude && preview.minLongitude === preview.maxLongitude)
  ) {
    return null
  }
  return {
    ne: [preview.maxLongitude, preview.maxLatitude] as [number, number],
    sw: [preview.minLongitude, preview.minLatitude] as [number, number],
  }
}

function cameraDistanceTo(
  camera: CameraSnapshot | null,
  target: { latitude: number; longitude: number },
) {
  if (!camera) return 0
  return distanceMeters(
    {
      longitude: camera.centerCoordinate[0],
      latitude: camera.centerCoordinate[1],
    },
    target,
  )
}

function historyMoveDuration(distanceM: number) {
  if (distanceM > INSTANT_JUMP_DISTANCE_M) return 0
  const progress = clamp(distanceM / HISTORY_DYNAMIC_FULL_DISTANCE_M, 0, 1)
  return MAP_DEFAULTS.animationDuration + HISTORY_DYNAMIC_MAX_EXTRA_DURATION_MS * progress
}

function cameraMoveDuration(distanceM: number, smoothDuration: number) {
  return distanceM > INSTANT_JUMP_DISTANCE_M ? 0 : smoothDuration
}

function getHistoryPreviewZoom(zoomLevel: number) {
  return clamp(zoomLevel - HISTORY_PREVIEW_ZOOM_OUT_DELTA, MIN_ZOOM, MAP_DEFAULTS.maxZoom)
}

function liveFollowKey(timestamp: number, camera: Pick<CameraSnapshot, 'heading' | 'zoomLevel'>) {
  return `${timestamp}:${camera.heading.toFixed(2)}:${camera.zoomLevel.toFixed(2)}`
}

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
  historyPreview: ({ key: string } & HistoryPreviewTarget) | null
  rideRoute: [number, number][]
  mapViewport: HistoryCameraViewport
  mapNavigationMode: MapNavigationMode
  gpsHeadingMode: boolean
  phoneHeadingMode: boolean
  phoneHeadingReady: boolean
  phoneHeadingOneShot: boolean
  followHeadingDeg: number
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
  historyPreview,
  rideRoute,
  mapViewport,
  mapNavigationMode,
  gpsHeadingMode,
  phoneHeadingMode,
  phoneHeadingReady,
  phoneHeadingOneShot,
  followHeadingDeg,
  resetHeadingOnRecenter,
  liveFollowUpdatesEnabled,
  followAnimationDuration,
  getViewfinderCoordinateFromMap,
  onHeadingChange,
  onPerspectiveChange,
}: UseCameraControlsParams) {
  const cameraRef = useRef<CameraRef>(null)
  const previewPanBaseRef = useRef<CameraSnapshot | null>(null)
  const previewZoomBaseRef = useRef<CameraSnapshot | null>(null)
  const currentCameraRef = useRef<CameraSnapshot | null>(null)
  const historyPreviewTargetRef = useRef<HistoryPreviewTarget | null>(null)
  const lastFollowKeyRef = useRef<string | null>(null)
  const followZoomLevelRef = useRef<number | null>(null)
  const previousGpsHeadingModeRef = useRef(gpsHeadingMode && !phoneHeadingMode)
  const previousPhoneHeadingModeRef = useRef(phoneHeadingMode)
  const phoneHeadingAppliedRef = useRef(false)
  const recenterLiveRef = useRef<
    ((options?: { resetPadding?: boolean; animationDuration?: number }) => void) | null
  >(null)
  const controllerStateRef = useRef(initialMapCameraControllerState)
  const [cameraMode, setCameraModeState] = useState<MapCameraMode>({ kind: 'liveFollow' })
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

  const enterCameraMode = useCallback((mode: MapCameraMode) => {
    controllerStateRef.current = { ...controllerStateRef.current, mode }
    setCameraModeState(mode)
  }, [])

  const dispatchCameraIntent = useCallback(
    (intent: Parameters<typeof reduceMapCameraIntent>[1]) => {
      const result = reduceMapCameraIntent(controllerStateRef.current, intent)
      controllerStateRef.current = result.state
      setCameraModeState(result.state.mode)
      return result.effect
    },
    [],
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
    const effect = dispatchCameraIntent({
      type: 'FollowLive',
      gpsCamera: { ...gpsCamera, zoomLevel: baseZoomLevel },
      followHeadingDeg,
      navigationMode: effectiveNavigationMode,
      perspectiveEnabled,
      viewportHeight,
      preserveHeading: resetHeadingOnRecenter ? undefined : currentCameraRef.current?.heading,
      enforceMinimums: !manualFollowZoom,
    })
    const followCamera = effect?.camera as CameraSnapshot
    if (resetHeadingOnRecenter) return followCamera
    return {
      ...followCamera,
      heading: currentCameraRef.current?.heading ?? followCamera.heading,
    }
  }, [
    followHeadingDeg,
    gpsCamera,
    dispatchCameraIntent,
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
    [cameraFix, enterCameraMode, getLiveFollowCamera, onHeadingChange],
  )

  useEffect(() => {
    recenterLiveRef.current = recenterLive
  }, [recenterLive])

  const fitRide = useCallback(
    (selectionKey: string | null) => {
      const historyCamera = getHistoryRouteCamera({
        route: rideRoute,
        viewport: historyViewport,
        maxZoom: MAP_DEFAULTS.maxZoom,
      })
      if (!historyCamera) return
      const currentCamera = currentCameraRef.current
      const routeCenter = {
        longitude: historyCamera.centerCoordinate[0],
        latitude: historyCamera.centerCoordinate[1],
      }
      const duration = historyMoveDuration(cameraDistanceTo(currentCamera, routeCenter))
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

  const restorePreviewPan = useCallback(() => {
    enterCameraMode({ kind: 'liveFollow' })
    const restoreCamera = previewPanBaseRef.current ?? getLiveFollowCamera()
    previewPanBaseRef.current = null
    if (cameraFix) {
      lastFollowKeyRef.current = liveFollowKey(cameraFix.timestamp, restoreCamera)
    }
    cameraRef.current?.setCamera({
      ...restoreCamera,
      heading: restoreCamera.heading,
      pitch: restoreCamera.pitch,
      animationDuration: cameraMoveDuration(
        cameraDistanceTo(currentCameraRef.current, {
          longitude: restoreCamera.centerCoordinate[0],
          latitude: restoreCamera.centerCoordinate[1],
        }),
        MAP_DEFAULTS.followAnimationDuration,
      ),
      animationMode: 'easeTo',
    })
  }, [cameraFix, enterCameraMode, getLiveFollowCamera])

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
        const baseCamera =
          followGps && !historyActive
            ? getLiveFollowCamera()
            : (currentCameraRef.current ?? {
                ...gpsCamera,
                heading: followHeadingDeg,
                pitch: getPitchForZoom(gpsCamera.zoomLevel, perspectiveEnabled),
              })
        previewPanBaseRef.current =
          followGps && gpsHeadingMode
            ? {
                ...baseCamera,
                heading: followHeadingDeg,
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
        cameraRef.current?.setCamera({
          ...getCameraAfterScreenDrag(baseCamera, deltaX, deltaY),
          zoomLevel,
          pitch: getPitchForZoom(zoomLevel, perspectiveEnabled),
          animationMode: 'linearTo',
          animationDuration,
        })
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
      zoomToLevel(zoom: number) {
        setFreeMapZoom(zoom)
      },
      focusCoordinate(coordinate: [number, number]) {
        setFollowGps(false)
        const current = currentCameraRef.current
        cameraRef.current?.setCamera({
          centerCoordinate: coordinate,
          zoomLevel: current?.zoomLevel,
          heading: current?.heading,
          pitch: current?.pitch,
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
      },
    }),
    [
      applyLiveFollowCamera,
      dispatchCameraIntent,
      followGps,
      followHeadingDeg,
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
    if (!cameraFix || !followGps || historyActive || !liveFollowUpdatesEnabled) return
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
    const frame = requestAnimationFrame(() => recenterLiveRef.current?.({ resetPadding: true }))
    return () => cancelAnimationFrame(frame)
  }, [gpsHeadingMode, historyActive, phoneHeadingMode])

  useEffect(() => {
    const wasPhoneHeadingMode = previousPhoneHeadingModeRef.current
    previousPhoneHeadingModeRef.current = phoneHeadingMode
    if (!phoneHeadingMode) {
      phoneHeadingAppliedRef.current = false
      return
    }
    if (
      !phoneHeadingOneShot ||
      historyActive ||
      !phoneHeadingReady ||
      phoneHeadingAppliedRef.current
    )
      return

    phoneHeadingAppliedRef.current = true
    const frame = requestAnimationFrame(() => {
      recenterLiveRef.current?.({ resetPadding: true })
    })
    return () => {
      if (!wasPhoneHeadingMode) phoneHeadingAppliedRef.current = false
      cancelAnimationFrame(frame)
    }
  }, [historyActive, phoneHeadingMode, phoneHeadingOneShot, phoneHeadingReady])

  useEffect(() => {
    if (!historyActive || !historyPreview) return
    setCameraModeRef({
      kind: 'rideHistory',
      selectionKey: historyPreview.key,
      phase: 'preview',
    })
    const frame = requestAnimationFrame(() => {
      const mode = controllerStateRef.current.mode
      if (
        mode.kind === 'rideHistory' &&
        mode.selectionKey === historyPreview.key &&
        mode.phase === 'route'
      ) {
        return
      }
      previewHistorySession(historyPreview)
    })
    return () => cancelAnimationFrame(frame)
  }, [historyActive, historyPreview, previewHistorySession, setCameraModeRef])

  useEffect(() => {
    if (!historyActive || rideRoute.length === 0) return
    historyPreviewTargetRef.current = null
    const selectionKey = historyPreview?.key ?? null
    setCameraModeRef({ kind: 'rideHistory', selectionKey, phase: 'route' })
    const frame = requestAnimationFrame(() => fitRide(selectionKey))
    return () => cancelAnimationFrame(frame)
  }, [fitRide, historyActive, historyPreview?.key, rideRoute.length, setCameraModeRef])

  return {
    cameraRef,
    currentCameraRef,
    gpsCamera,
    followGps,
    setFollowGps,
    setFollowZoomLevel,
    recenterLive,
    getLiveFollowCamera,
    getHistoryPreviewCamera,
  }
}
