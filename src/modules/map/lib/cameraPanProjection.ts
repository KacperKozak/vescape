const MERCATOR_TILE_SIZE = 512
const MAX_MERCATOR_LATITUDE = 85.05112878

export interface CameraPanSnapshot {
  centerCoordinate: [number, number]
  zoomLevel: number
  heading: number
  pitch: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function longitudeToWorldX(longitude: number, worldSize: number) {
  return ((longitude + 180) / 360) * worldSize
}

function latitudeToWorldY(latitude: number, worldSize: number) {
  const clampedLatitude = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)
  const sinLatitude = Math.sin((clampedLatitude * Math.PI) / 180)
  return (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * worldSize
}

function worldXToLongitude(x: number, worldSize: number) {
  return (x / worldSize) * 360 - 180
}

function worldYToLatitude(y: number, worldSize: number) {
  const mercatorY = 0.5 - y / worldSize
  return (180 / Math.PI) * (2 * Math.atan(Math.exp(mercatorY * 2 * Math.PI)) - Math.PI / 2)
}

export function getCameraAfterScreenDrag(
  baseCamera: CameraPanSnapshot,
  fingerDeltaX: number,
  fingerDeltaY: number,
) {
  const worldSize = MERCATOR_TILE_SIZE * 2 ** baseCamera.zoomLevel
  const [longitude, latitude] = baseCamera.centerCoordinate
  const headingRadians = (baseCamera.heading * Math.PI) / 180
  const worldDeltaX =
    fingerDeltaX * Math.cos(headingRadians) - fingerDeltaY * Math.sin(headingRadians)
  const worldDeltaY =
    fingerDeltaX * Math.sin(headingRadians) + fingerDeltaY * Math.cos(headingRadians)
  const centerX = longitudeToWorldX(longitude, worldSize) - worldDeltaX
  const centerY = latitudeToWorldY(latitude, worldSize) - worldDeltaY

  return {
    ...baseCamera,
    centerCoordinate: [
      worldXToLongitude(centerX, worldSize),
      clamp(worldYToLatitude(centerY, worldSize), -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE),
    ] as [number, number],
  }
}
