import { useCallback, useLayoutEffect, useRef } from 'react'

import { MAP_DEFAULTS } from '@/modules/map/constants/mapStyles'
import { getMapRevealPitch, getPitchForZoom } from '@/modules/map/lib/cameraProfiles'
import { getCameraAfterScreenDrag } from '@/modules/map/lib/cameraPanProjection'
import {
  clamp,
  liveFollowKey,
  MAP_REVEAL_ZOOM_OUT_DELTA,
  MIN_ZOOM,
  type CameraSnapshot,
} from '@/modules/map/lib/cameraMotion'
import type { CameraControlRefs, GpsFix } from '@/screens/main/map/cameraControlTypes'

interface UseCameraPreviewGesturesParams {
  cameraRefs: CameraControlRefs
  cameraFix: GpsFix | null
  followGps: boolean
  gpsCamera: Pick<CameraSnapshot, 'centerCoordinate' | 'zoomLevel'>
  gpsHeadingMode: boolean
  historyActive: boolean
  perspectiveEnabled: boolean
  applyLiveFollowCamera: () => void
  enterCameraMode: (mode: { kind: 'liveFollow' }) => void
  getFollowHeadingDeg: () => number
  getLiveFollowCamera: () => CameraSnapshot
  setFollowGps: (enabled: boolean) => void
  setFollowZoomLevel: (zoomLevel: number) => void
}

export function useCameraPreviewGestures({
  cameraRefs,
  cameraFix,
  followGps,
  gpsCamera,
  gpsHeadingMode,
  historyActive,
  perspectiveEnabled,
  applyLiveFollowCamera,
  enterCameraMode,
  getFollowHeadingDeg,
  getLiveFollowCamera,
  setFollowGps,
  setFollowZoomLevel,
}: UseCameraPreviewGesturesParams) {
  const { cameraRef, currentCameraRef, engine, lastFollowKeyRef } = cameraRefs
  const previewPanBaseRef = useRef<CameraSnapshot | null>(null)
  const previewPanCameraRef = useRef<CameraSnapshot | null>(null)
  const previewZoomBaseRef = useRef<CameraSnapshot | null>(null)
  const previewPanActiveRef = useRef(false)
  const imperativeHandleLatest = {
    applyLiveFollowCamera,
    followGps,
    getFollowHeadingDeg,
    getLiveFollowCamera,
    gpsCamera,
    gpsHeadingMode,
    historyActive,
    perspectiveEnabled,
    setFollowGps,
    setFollowZoomLevel,
  }
  const imperativeHandleLatestRef = useRef(imperativeHandleLatest)
  useLayoutEffect(() => {
    imperativeHandleLatestRef.current = imperativeHandleLatest
  })

  const beginPreviewPan = useCallback(() => {
    const {
      followGps,
      getFollowHeadingDeg,
      getLiveFollowCamera,
      gpsCamera,
      gpsHeadingMode,
      historyActive,
      perspectiveEnabled,
      setFollowGps,
    } = imperativeHandleLatestRef.current
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
  }, [currentCameraRef])

  const previewPanBy = useCallback(
    (deltaX: number, deltaY: number, _animationDuration = 0, revealProgress = 0) => {
      const { perspectiveEnabled, setFollowGps } = imperativeHandleLatestRef.current
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
      // Engine shadow-tracks the drag so a later release blends out of the
      // gesture's velocity instead of jumping.
      engine.driveExternal(
        {
          centerCoordinate: previewCamera.centerCoordinate,
          zoomLevel: previewCamera.zoomLevel,
          heading: previewCamera.heading,
          pitch: previewCamera.pitch,
        },
        1 / 60,
      )
      cameraRef.current?.setCameraDirect({
        center: previewCamera.centerCoordinate,
        zoom: previewCamera.zoomLevel,
        heading: previewCamera.heading,
        pitch: previewCamera.pitch,
      })
    },
    [cameraRef, currentCameraRef, engine],
  )

  const endPreviewPan = useCallback(() => {
    imperativeHandleLatestRef.current.setFollowGps(false)
    previewPanActiveRef.current = false
    previewPanBaseRef.current = null
    previewPanCameraRef.current = null
  }, [])

  const beginPreviewZoom = useCallback(() => {
    const { followGps, getLiveFollowCamera, historyActive } = imperativeHandleLatestRef.current
    previewZoomBaseRef.current =
      followGps && !historyActive ? getLiveFollowCamera() : currentCameraRef.current
  }, [currentCameraRef])

  const previewZoomBy = useCallback((scale: number) => {
    const { applyLiveFollowCamera, followGps, historyActive, setFollowZoomLevel } =
      imperativeHandleLatestRef.current
    const baseCamera = previewZoomBaseRef.current
    if (!baseCamera || scale <= 0) return
    const zoomLevel = clamp(baseCamera.zoomLevel + Math.log2(scale), MIN_ZOOM, MAP_DEFAULTS.maxZoom)
    setFollowZoomLevel(zoomLevel)
    if (followGps && !historyActive) {
      applyLiveFollowCamera()
    }
  }, [])

  const endPreviewZoom = useCallback(() => {
    void imperativeHandleLatestRef.current
    previewZoomBaseRef.current = null
  }, [])

  const restorePreviewPan = useCallback(() => {
    previewPanActiveRef.current = false
    enterCameraMode({ kind: 'liveFollow' })
    const restoreCamera = previewPanBaseRef.current ?? getLiveFollowCamera()
    previewPanBaseRef.current = null
    previewPanCameraRef.current = null
    if (cameraFix) {
      lastFollowKeyRef.current = liveFollowKey(cameraFix.timestamp, restoreCamera)
    }
    // The engine shadow-tracked the pan, so the return ride starts from the
    // gesture's position and velocity — no snap on release.
    engine.setTarget({
      center: restoreCamera.centerCoordinate,
      zoom: restoreCamera.zoomLevel,
      heading: restoreCamera.heading,
      pitch: restoreCamera.pitch,
      padding: restoreCamera.padding,
    })
  }, [cameraFix, engine, enterCameraMode, getLiveFollowCamera, lastFollowKeyRef])

  return {
    previewPanActiveRef,
    beginPreviewPan,
    previewPanBy,
    endPreviewPan,
    beginPreviewZoom,
    previewZoomBy,
    endPreviewZoom,
    restorePreviewPan,
  }
}
