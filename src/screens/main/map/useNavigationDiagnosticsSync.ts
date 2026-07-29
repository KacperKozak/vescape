import { useEffect, type RefObject } from 'react'
import type { LocationEvent } from 'vescape-core'

import type { MapNavigationMode } from '@/modules/map/constants/mapStyles'
import { getNavigationFallbackReason } from '@/modules/map/lib/navigationDiagnostics'
import type { PhoneHeadingStatus } from '@/modules/map/lib/phoneHeading'
import { useNavigationDiagnosticsStore } from '@/modules/map/store/navigationDiagnosticsStore'

export function useNavigationDiagnosticsSync({
  gpsFix,
  retainedGpsBearing,
  phoneHeadingDegRef,
  phoneHeadingStatus,
  gpsPinBearingDeg,
  displayedCameraHeading,
  mapNavigationMode,
}: {
  gpsFix: LocationEvent | null
  retainedGpsBearing: { bearingDeg: number; sourceTimestamp: number } | null
  phoneHeadingDegRef: RefObject<number | null>
  phoneHeadingStatus: PhoneHeadingStatus | 'idle'
  gpsPinBearingDeg: number | null
  displayedCameraHeading: number
  mapNavigationMode: MapNavigationMode
}) {
  const updateNavigationDiagnostics = useNavigationDiagnosticsStore((state) => state.update)

  useEffect(() => {
    updateNavigationDiagnostics({
      gpsFix,
      retainedGpsBearingDeg: retainedGpsBearing?.bearingDeg ?? null,
      retainedGpsBearingAt: retainedGpsBearing?.sourceTimestamp ?? null,
      phoneHeadingDeg: phoneHeadingDegRef.current,
      phoneHeadingStatus,
      activeDisplayHeadingDeg: gpsPinBearingDeg,
      cameraHeadingDeg: displayedCameraHeading,
      fallbackReason: getNavigationFallbackReason({
        mapNavigationMode,
        gpsFix,
        retainedGpsBearingDeg: retainedGpsBearing?.bearingDeg ?? null,
        phoneHeadingDeg: phoneHeadingDegRef.current,
        phoneHeadingStatus,
      }),
    })
  }, [
    displayedCameraHeading,
    gpsFix,
    gpsPinBearingDeg,
    mapNavigationMode,
    phoneHeadingDegRef,
    phoneHeadingStatus,
    retainedGpsBearing?.bearingDeg,
    retainedGpsBearing?.sourceTimestamp,
    updateNavigationDiagnostics,
  ])
}
