import type { MapNavigationMode } from '@/constants/mapStyles'

export function getGpsPuckBearing({
  navigationMode,
  approximateFix,
  phoneHeadingDeg,
  gpsBearingDeg,
}: {
  navigationMode: MapNavigationMode
  approximateFix: boolean
  phoneHeadingDeg: number | null
  gpsBearingDeg: number | null
}): number | null {
  if (approximateFix) return null
  return navigationMode === 'gpsHeading' ? gpsBearingDeg : phoneHeadingDeg
}
