import type { Camera as CameraRef } from '@rnmapbox/maps'
import type { RefObject } from 'react'

import { MAP_DEFAULTS } from '@/modules/map/constants/mapStyles'

import type { CameraSnapshot } from '@/screens/main/map/useCameraControls'

/**
 * Move the camera to a coordinate while keeping the current zoom, heading and pitch.
 * Shared by every "focus this point" flow so they stay visually identical.
 */
export function panPreservingCamera(
  cameraRef: RefObject<CameraRef | null>,
  currentCameraRef: RefObject<CameraSnapshot | null>,
  centerCoordinate: [number, number],
  options?: { minZoomLevel?: number },
) {
  const current = currentCameraRef.current
  const zoomLevel =
    options?.minZoomLevel == null
      ? current?.zoomLevel
      : Math.max(current?.zoomLevel ?? MAP_DEFAULTS.persistedGpsFallbackZoom, options.minZoomLevel)
  cameraRef.current?.setCamera({
    centerCoordinate,
    zoomLevel,
    heading: current?.heading,
    pitch: current?.pitch,
    animationDuration: MAP_DEFAULTS.animationDuration,
    animationMode: 'easeTo',
  })
}
