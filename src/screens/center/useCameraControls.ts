import type { Camera as CameraRef } from '@rnmapbox/maps'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Dimensions } from 'react-native'

import { MAP_DEFAULTS } from '@/constants/mapStyles'
import { distanceMeters, zoomLevelForDelta } from '@/helpers/mapGeometry'
import { getLiveFollowCameraProfile, getPitchForZoom } from '@/screens/center/cameraFollowProfile'
import { getCameraAfterScreenDrag } from '@/screens/center/cameraPanProjection'
import { getHistoryRouteCamera, type HistoryCameraViewport } from '@/screens/center/historyCamera'

const MIN_ZOOM = 0
const HISTORY_DYNAMIC_FULL_DISTANCE_M = 80_000
const HISTORY_DYNAMIC_MAX_EXTRA_DURATION_MS = 450
const INSTANT_JUMP_DISTANCE_M = 10_000

export interface CameraSnapshot {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
}

export interface HistoryPreviewTarget {
  latitude: number
  longitude: number
  minLatitude: number | null
  maxLatitude: number | null
  minLongitude: number | null
  maxLongitude: number | null
}

type CameraMode =
  | { kind: 'liveFollow' }
  | { kind: 'freeMap' }
  | {
      kind: 'rideHistory'
      selectionKey: string | null
      phase: 'preview' | 'route' | 'manualInspect'
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
  gpsHeadingMode: boolean
  phoneHeadingMode: boolean
  phoneHeadingReady: boolean
  phoneHeadingOneShot: boolean
  followHeadingDeg: number
  resetHeadingOnRecenter: boolean
  liveFollowUpdatesEnabled: boolean
  followAnimationDuration: number
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
  gpsHeadingMode,
  phoneHeadingMode,
  phoneHeadingReady,
  phoneHeadingOneShot,
  followHeadingDeg,
  resetHeadingOnRecenter,
  liveFollowUpdatesEnabled,
  followAnimationDuration,
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
  const cameraModeRef = useRef<CameraMode>({ kind: 'liveFollow' })
  const [cameraMode, setCameraModeState] = useState<CameraMode>({ kind: 'liveFollow' })
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

  const setCameraModeRef = useCallback((mode: CameraMode) => {
    cameraModeRef.current = mode
  }, [])

  const enterCameraMode = useCallback((mode: CameraMode) => {
    cameraModeRef.current = mode
    setCameraModeState(mode)
  }, [])

  const setFollowGps = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        lastFollowKeyRef.current = null
        enterCameraMode({ kind: 'liveFollow' })
        return
      }
      enterCameraMode(
        historyActive
          ? {
              kind: 'rideHistory',
              selectionKey: historyPreview?.key ?? null,
              phase: 'manualInspect',
            }
          : { kind: 'freeMap' },
      )
    },
    [enterCameraMode, historyActive, historyPreview?.key],
  )

  const setFollowZoomLevel = useCallback((zoomLevel: number) => {
    followZoomLevelRef.current = clamp(zoomLevel, MIN_ZOOM, MAP_DEFAULTS.maxZoom)
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
    const followCamera = getLiveFollowCameraProfile({
      gpsCamera: { ...gpsCamera, zoomLevel: baseZoomLevel },
      followHeadingDeg,
      gpsHeadingMode,
      perspectiveEnabled,
      viewportHeight,
      enforceHeadingMinimums: !manualFollowZoom,
    })
    if (resetHeadingOnRecenter) return followCamera
    return {
      ...followCamera,
      heading: currentCameraRef.current?.heading ?? followCamera.heading,
    }
  }, [
    followHeadingDeg,
    gpsCamera,
    gpsHeadingMode,
    perspectiveEnabled,
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
      const zoomLevel = camera?.zoomLevel ?? MAP_DEFAULTS.persistedGpsFallbackZoom
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
      enterCameraMode({ kind: 'rideHistory', selectionKey, phase: 'route' })
      const currentCamera = currentCameraRef.current
      const routeCenter = {
        longitude: historyCamera.centerCoordinate[0],
        latitude: historyCamera.centerCoordinate[1],
      }
      const duration = historyMoveDuration(cameraDistanceTo(currentCamera, routeCenter))
      cameraRef.current?.setCamera({
        ...historyCamera,
        heading: 0,
        pitch: getPitchForZoom(historyCamera.zoomLevel, perspectiveEnabled),
        animationDuration: duration,
        animationMode: 'easeTo',
      })
      onHeadingChange(0)
    },
    [enterCameraMode, historyViewport, onHeadingChange, perspectiveEnabled, rideRoute],
  )

  const previewHistorySession = useCallback(
    (preview: HistoryPreviewTarget & { key?: string }) => {
      const lastTarget = historyPreviewTargetRef.current
      historyPreviewTargetRef.current = preview
      enterCameraMode({
        kind: 'rideHistory',
        selectionKey: preview.key ?? null,
        phase: 'preview',
      })
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
          cameraRef.current?.setCamera({
            ...historyCamera,
            heading: 0,
            pitch: getPitchForZoom(historyCamera.zoomLevel, perspectiveEnabled),
            animationDuration: duration,
            animationMode: 'easeTo',
          })
        }
      } else {
        cameraRef.current?.setCamera({
          ...getHistoryPreviewCamera(preview),
          animationDuration: duration,
        })
      }
      onHeadingChange(0)
    },
    [
      enterCameraMode,
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
      previewPanBy(deltaX: number, deltaY: number, animationDuration = 0) {
        setFollowGps(false)
        const baseCamera = previewPanBaseRef.current
        if (!baseCamera) return
        cameraRef.current?.setCamera({
          ...getCameraAfterScreenDrag(baseCamera, deltaX, deltaY),
          pitch: baseCamera.pitch,
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
        const zoomLevel = currentCameraRef.current?.zoomLevel ?? gpsCamera.zoomLevel
        cameraRef.current?.setCamera({
          pitch: getPitchForZoom(zoomLevel, enabled),
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
      zoomToLevel(zoom: number) {
        setFollowGps(false)
        const current = currentCameraRef.current
        cameraRef.current?.setCamera({
          ...(current ? { centerCoordinate: current.centerCoordinate } : {}),
          zoomLevel: zoom,
          pitch: getPitchForZoom(zoom, perspectiveEnabled),
          animationDuration: MAP_DEFAULTS.animationDuration,
          animationMode: 'easeTo',
        })
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
      followGps,
      followHeadingDeg,
      getLiveFollowCamera,
      gpsCamera,
      gpsHeadingMode,
      historyActive,
      onHeadingChange,
      onPerspectiveChange,
      perspectiveEnabled,
      previewHistorySession,
      recenterLive,
      restorePreviewPan,
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
      const mode = cameraModeRef.current
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
