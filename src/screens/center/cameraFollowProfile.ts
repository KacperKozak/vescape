const GPS_HEADING_MIN_ZOOM = 16
const GPS_HEADING_MIN_PITCH = 56
const GPS_HEADING_VERTICAL_OFFSET_RATIO = 0.2
const PERSPECTIVE_MIN_ZOOM = 11
const PERSPECTIVE_MAX_ZOOM = 16
const ACTIVE_PITCH = 45

interface CameraPadding {
  paddingTop: number
  paddingRight: number
  paddingBottom: number
  paddingLeft: number
}

export interface LiveFollowCameraProfile {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
  padding?: CameraPadding
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function getPitchForZoom(zoom: number, perspectiveEnabled: boolean) {
  if (!perspectiveEnabled) return 0
  const progress = clamp(
    (zoom - PERSPECTIVE_MIN_ZOOM) / (PERSPECTIVE_MAX_ZOOM - PERSPECTIVE_MIN_ZOOM),
    0,
    1,
  )
  return progress * ACTIVE_PITCH
}

export function getLiveFollowCameraProfile({
  gpsCamera,
  followHeadingDeg,
  gpsHeadingMode,
  perspectiveEnabled,
  viewportHeight,
  enforceHeadingMinimums = true,
}: {
  gpsCamera: Pick<LiveFollowCameraProfile, 'centerCoordinate' | 'zoomLevel'>
  followHeadingDeg: number
  gpsHeadingMode: boolean
  perspectiveEnabled: boolean
  viewportHeight?: number
  enforceHeadingMinimums?: boolean
}): LiveFollowCameraProfile {
  const zoomLevel =
    gpsHeadingMode && enforceHeadingMinimums
      ? Math.max(gpsCamera.zoomLevel, GPS_HEADING_MIN_ZOOM)
      : gpsCamera.zoomLevel
  const pitch =
    gpsHeadingMode && enforceHeadingMinimums
      ? Math.max(getPitchForZoom(zoomLevel, perspectiveEnabled), GPS_HEADING_MIN_PITCH)
      : getPitchForZoom(zoomLevel, perspectiveEnabled)

  return {
    ...gpsCamera,
    zoomLevel,
    heading: followHeadingDeg,
    pitch: perspectiveEnabled ? pitch : 0,
    ...(gpsHeadingMode && viewportHeight != null
      ? {
          padding: {
            paddingTop: Math.round(viewportHeight * GPS_HEADING_VERTICAL_OFFSET_RATIO),
            paddingRight: 0,
            paddingBottom: 0,
            paddingLeft: 0,
          },
        }
      : {}),
  }
}
