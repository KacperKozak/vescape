import { useCallback, useEffect } from 'react'

import { distanceMeters } from '@/helpers/mapGeometry'
import { MAP_DEFAULTS } from '@/modules/map/constants/mapStyles'
import type { reduceMapCameraIntent } from '@/modules/map/lib/cameraController'
import { getPitchForZoom } from '@/modules/map/lib/cameraProfiles'
import { getHistoryRouteCamera, type HistoryCameraViewport } from '@/modules/map/lib/historyCamera'
import {
  cameraDistanceTo,
  clamp,
  getHistoryPreviewBounds,
  getHistoryPreviewZoom,
  historyBucketPreviewDuration,
  HISTORY_BUCKET_PREVIEW_ZOOM_OUT_DELTA,
  HISTORY_ROUTE_REFINEMENT_DURATION_MS,
  historyMoveDuration,
  INSTANT_JUMP_DISTANCE_M,
  MIN_ZOOM,
  type HistoryPreviewTarget,
} from '@/modules/map/lib/cameraMotion'
import type { CameraControlRefs } from '@/screens/main/map/cameraControlTypes'

interface UseHistoryCameraFramingParams {
  cameraRefs: CameraControlRefs
  active: boolean
  selectionKey: string | null
  preview: ({ key: string } & HistoryPreviewTarget) | null
  previewRoute: [number, number][]
  rideRoute: [number, number][]
  viewport: HistoryCameraViewport
  perspectiveEnabled: boolean
  dispatchCameraIntent: (
    intent: Parameters<typeof reduceMapCameraIntent>[1],
  ) => ReturnType<typeof reduceMapCameraIntent>['effect']
  setCameraModeRef: (mode: {
    kind: 'rideHistory'
    selectionKey: string | null
    phase: 'preview'
  }) => void
  onHeadingChange: (heading: number) => void
}

export function useHistoryCameraFraming({
  cameraRefs,
  active,
  selectionKey,
  preview,
  previewRoute,
  rideRoute,
  viewport,
  perspectiveEnabled,
  dispatchCameraIntent,
  setCameraModeRef,
  onHeadingChange,
}: UseHistoryCameraFramingParams) {
  const { cameraRef, controllerStateRef, currentCameraRef, historyPreviewTargetRef } = cameraRefs
  const getHistoryPreviewCamera = useCallback(
    (coordinate: { latitude: number; longitude: number }) => {
      const camera = getHistoryRouteCamera({
        route: [[coordinate.longitude, coordinate.latitude]],
        viewport,
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
    [perspectiveEnabled, viewport],
  )

  const fitRide = useCallback(
    (nextSelectionKey: string | null) => {
      const historyCamera = getHistoryRouteCamera({
        route: rideRoute,
        viewport,
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
        selectionKey: nextSelectionKey,
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
    [
      cameraRef,
      currentCameraRef,
      dispatchCameraIntent,
      onHeadingChange,
      perspectiveEnabled,
      rideRoute,
      viewport,
    ],
  )

  const previewHistorySession = useCallback(
    (nextPreview: HistoryPreviewTarget & { key?: string }) => {
      const lastTarget = historyPreviewTargetRef.current
      historyPreviewTargetRef.current = nextPreview
      const currentCamera = currentCameraRef.current
      const currentDistanceM = cameraDistanceTo(currentCamera, nextPreview)
      const lastTargetDistanceM = lastTarget
        ? distanceMeters(lastTarget, nextPreview)
        : currentDistanceM
      const duration = historyMoveDuration(Math.max(currentDistanceM, lastTargetDistanceM))
      const bounds = getHistoryPreviewBounds(nextPreview)
      if (bounds) {
        const historyCamera = getHistoryRouteCamera({
          route: [bounds.ne, bounds.sw],
          viewport,
          maxZoom: MAP_DEFAULTS.maxZoom,
        })
        if (historyCamera) {
          const zoomLevel = getHistoryPreviewZoom(historyCamera.zoomLevel)
          const effect = dispatchCameraIntent({
            type: 'FrameRideHistoryPreview',
            selectionKey: nextPreview.key ?? null,
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
        const previewCamera = getHistoryPreviewCamera(nextPreview)
        const effect = dispatchCameraIntent({
          type: 'FrameRideHistoryPreview',
          selectionKey: nextPreview.key ?? null,
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
      cameraRef,
      currentCameraRef,
      dispatchCameraIntent,
      getHistoryPreviewCamera,
      historyPreviewTargetRef,
      onHeadingChange,
      perspectiveEnabled,
      viewport,
    ],
  )

  const previewHistoryRoute = useCallback(
    (nextSelectionKey: string, route: [number, number][]) => {
      const historyCamera = getHistoryRouteCamera({
        route,
        viewport,
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
        selectionKey: nextSelectionKey,
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
    [
      cameraRef,
      currentCameraRef,
      dispatchCameraIntent,
      onHeadingChange,
      perspectiveEnabled,
      viewport,
    ],
  )

  useEffect(() => {
    if (!active || !selectionKey) return

    const mode = controllerStateRef.current.mode
    if (mode.kind !== 'rideHistory' || mode.selectionKey !== selectionKey) {
      setCameraModeRef({
        kind: 'rideHistory',
        selectionKey,
        phase: 'preview',
      })
    }

    const frame = requestAnimationFrame(() => {
      if (rideRoute.length > 0) {
        historyPreviewTargetRef.current = null
        fitRide(selectionKey)
        return
      }
      if (previewRoute.length > 0) {
        previewHistoryRoute(selectionKey, previewRoute)
        return
      }
      if (preview?.key === selectionKey) {
        previewHistorySession(preview)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [
    active,
    controllerStateRef,
    fitRide,
    historyPreviewTargetRef,
    preview,
    previewHistoryRoute,
    previewHistorySession,
    previewRoute,
    rideRoute,
    selectionKey,
    setCameraModeRef,
  ])

  return {
    getHistoryPreviewCamera,
    previewHistorySession,
  }
}
