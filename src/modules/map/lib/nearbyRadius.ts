/** Server cap on one nearby read (`docs/map-points/API.md`). */
const MAX_RADIUS_METERS = 50_000
const MIN_RADIUS_METERS = 500
const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686
/** Mapbox tiles are 512px, so one tile spans `circumference * cos(lat) / 2^zoom` metres. */
const TILE_SIZE_PX = 512
const ASSUMED_VIEWPORT_PX = 1024

/**
 * Radius to ask the server for, so a nearby read covers what the rider can actually see. Grows as
 * the camera zooms out and is clamped to the server's own limits.
 */
export function nearbyRadiusMeters(zoom: number, latitude: number): number {
  if (!Number.isFinite(zoom) || !Number.isFinite(latitude)) return MIN_RADIUS_METERS
  const latitudeScale = Math.cos((Math.min(Math.abs(latitude), 85) * Math.PI) / 180)
  const metersPerPixel = (EARTH_CIRCUMFERENCE_METERS * latitudeScale) / (TILE_SIZE_PX * 2 ** zoom)
  const radius = (metersPerPixel * ASSUMED_VIEWPORT_PX) / 2
  if (!Number.isFinite(radius)) return MIN_RADIUS_METERS
  return Math.round(Math.min(Math.max(radius, MIN_RADIUS_METERS), MAX_RADIUS_METERS))
}

/**
 * Distance between two coordinates in metres (haversine). Used to decide whether the camera moved
 * far enough to be worth another nearby read.
 */
export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRadians(to.latitude - from.latitude)
  const dLon = toRadians(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)))
}
