export function zoomLevelForDelta(delta: number): number {
  return Math.max(3, Math.min(19, Math.log2(360 / Math.max(delta, 0.0001))))
}

export function makeCircleFeature(
  longitude: number,
  latitude: number,
  radiusM: number,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const earthRadiusM = 6_378_137
  const latRad = (latitude * Math.PI) / 180
  const coordinates: [number, number][] = []
  for (let i = 0; i <= 64; i += 1) {
    const bearing = (i / 64) * Math.PI * 2
    const latOffset = (radiusM / earthRadiusM) * Math.cos(bearing)
    const lonOffset = (radiusM / (earthRadiusM * Math.cos(latRad))) * Math.sin(bearing)
    coordinates.push([
      longitude + (lonOffset * 180) / Math.PI,
      latitude + (latOffset * 180) / Math.PI,
    ])
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coordinates] },
    properties: {},
  }
}

export function makeTrailLineString(
  locations: { longitude: number; latitude: number }[],
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: locations.map((l) => [l.longitude, l.latitude]),
    },
    properties: {},
  }
}

export function getBounds(coordinates: [number, number][]): {
  ne: [number, number]
  sw: [number, number]
} {
  let minLon = coordinates[0][0]
  let maxLon = coordinates[0][0]
  let minLat = coordinates[0][1]
  let maxLat = coordinates[0][1]
  for (const [longitude, latitude] of coordinates) {
    minLon = Math.min(minLon, longitude)
    maxLon = Math.max(maxLon, longitude)
    minLat = Math.min(minLat, latitude)
    maxLat = Math.max(maxLat, latitude)
  }
  return {
    ne: [maxLon, maxLat],
    sw: [minLon, minLat],
  }
}
