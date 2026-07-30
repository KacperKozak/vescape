import type { Camera as CameraRef } from '@rnmapbox/maps'
import type { ForwardedRef, RefObject } from 'react'

import type { MapNavigationMode } from '@/modules/map/constants/mapStyles'
import type { MapCameraControllerState } from '@/modules/map/lib/cameraController'
import type { HistoryCameraViewport } from '@/modules/map/lib/historyCamera'
import type { CameraSnapshot, HistoryPreviewTarget } from '@/modules/map/lib/cameraMotion'

export interface GpsFix {
  latitude: number
  longitude: number
  timestamp: number
  accuracyM?: number | null
}

export interface CameraControlRefs {
  cameraRef: RefObject<CameraRef | null>
  currentCameraRef: RefObject<CameraSnapshot | null>
  controllerStateRef: RefObject<MapCameraControllerState>
  followZoomLevelRef: RefObject<number | null>
  historyPreviewTargetRef: RefObject<HistoryPreviewTarget | null>
  lastFollowKeyRef: RefObject<string | null>
}

export interface UseCameraControlsParams {
  ref: ForwardedRef<any>
  cameraFix: GpsFix | null
  persistedFallback: [number, number] | null
  perspectiveEnabled: boolean
  mapViewport: HistoryCameraViewport
  mapNavigationMode: MapNavigationMode
  heading: {
    gpsMode: boolean
    phoneMode: boolean
    phoneReady: boolean
    getFollowDeg: () => number
    resetOnRecenter: boolean
  }
  history: {
    active: boolean
    selectionKey: string | null
    preview: ({ key: string } & HistoryPreviewTarget) | null
    previewRoute: [number, number][]
    rideRoute: [number, number][]
  }
  follow: {
    updatesEnabled: boolean
    animationDuration: number
  }
  getViewfinderCoordinateFromMap?: () => Promise<{ latitude: number; longitude: number } | null>
  onHeadingChange: (heading: number) => void
  onPerspectiveChange: (enabled: boolean) => void
}
