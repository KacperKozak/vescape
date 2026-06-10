import { MAPBOX_ACCESS_TOKEN } from '@/config/mapy'

export interface MapSearchResult {
  id: string
  title: string
  subtitle: string
  latitude: number
  longitude: number
}

interface MapboxGeocodingFeature {
  id?: string
  geometry?: {
    coordinates?: unknown
  }
  properties?: {
    mapbox_id?: string
    name?: string
    full_address?: string
    place_formatted?: string
  }
}

interface MapboxGeocodingResponse {
  features?: MapboxGeocodingFeature[]
}

function normalizeSearchQuery(query: string) {
  return query.trim()
}

function getFeatureCoordinates(feature: MapboxGeocodingFeature) {
  const coordinates = feature.geometry?.coordinates
  if (!Array.isArray(coordinates)) return null
  const [longitude, latitude] = coordinates
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
  return { latitude, longitude }
}

function getFeatureTitle(feature: MapboxGeocodingFeature) {
  return feature.properties?.name ?? 'Unnamed place'
}

function getFeatureSubtitle(feature: MapboxGeocodingFeature) {
  const fullAddress = feature.properties?.full_address
  const place = feature.properties?.place_formatted
  return fullAddress && place ? fullAddress : fullAddress || place || 'Mapbox result'
}

function toMapSearchResult(feature: MapboxGeocodingFeature): MapSearchResult | null {
  const coordinate = getFeatureCoordinates(feature)
  if (!coordinate) return null

  return {
    id:
      feature.properties?.mapbox_id ??
      feature.id ??
      `${coordinate.longitude},${coordinate.latitude}`,
    title: getFeatureTitle(feature),
    subtitle: getFeatureSubtitle(feature),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  }
}

interface SearchMapResultsOptions {
  proximity?: { latitude: number; longitude: number } | null
  signal?: AbortSignal
}

export async function searchMapResults(query: string, options: SearchMapResultsOptions = {}) {
  const normalized = normalizeSearchQuery(query)
  if (normalized.length < 2) return []
  if (!MAPBOX_ACCESS_TOKEN) throw new Error('Mapbox access token missing')

  const params = new URLSearchParams({
    q: normalized,
    access_token: MAPBOX_ACCESS_TOKEN,
    autocomplete: 'true',
    limit: '5',
    types: 'address,street,place,locality,neighborhood',
  })
  if (options.proximity) {
    params.set('proximity', `${options.proximity.longitude},${options.proximity.latitude}`)
  }

  const response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params}`, {
    signal: options.signal,
  })
  if (!response.ok) {
    throw new Error(`Mapbox search failed: ${response.status}`)
  }

  const data = (await response.json()) as MapboxGeocodingResponse
  return (data.features ?? []).map(toMapSearchResult).filter((result) => result != null)
}
