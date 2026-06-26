import {
  getPaddingForProfile,
  getPitchForProfileZoom,
  getProfileZoomLevel,
  type CameraPadding,
  type MapCameraProfileKey,
} from '@/lib/map/cameraProfiles'

export type { CameraPadding } from '@/lib/map/cameraProfiles'

export interface LiveFollowCameraProfile {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
  padding?: CameraPadding
}

export function getPitchForZoom(zoom: number, perspectiveEnabled: boolean) {
  return getPitchForProfileZoom({
    profile: 'northUp',
    zoom,
    perspectiveEnabled,
    enforceMinimums: false,
  })
}

export function getLiveFollowCameraProfile({
  gpsCamera,
  followHeadingDeg,
  gpsHeadingMode,
  profileKey,
  perspectiveEnabled,
  viewportHeight,
  enforceHeadingMinimums = true,
}: {
  gpsCamera: Pick<LiveFollowCameraProfile, 'centerCoordinate' | 'zoomLevel'>
  followHeadingDeg: number
  gpsHeadingMode: boolean
  profileKey?: MapCameraProfileKey
  perspectiveEnabled: boolean
  viewportHeight?: number
  enforceHeadingMinimums?: boolean
}): LiveFollowCameraProfile {
  const profile = profileKey ?? (gpsHeadingMode ? 'gpsHeading' : 'northUp')
  const zoomLevel = getProfileZoomLevel({
    profile,
    zoom: gpsCamera.zoomLevel,
    enforceMinimums: enforceHeadingMinimums,
  })
  const pitch = getPitchForProfileZoom({
    profile,
    zoom: zoomLevel,
    perspectiveEnabled,
    enforceMinimums: enforceHeadingMinimums,
  })
  const padding = getPaddingForProfile({ profile, viewportHeight })

  return {
    ...gpsCamera,
    zoomLevel,
    heading: followHeadingDeg,
    pitch: perspectiveEnabled ? pitch : 0,
    padding,
  }
}
