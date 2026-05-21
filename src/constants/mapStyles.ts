import Mapbox from '@rnmapbox/maps'
import { MapTrifoldIcon, MoonStarsIcon, MountainsIcon, PlanetIcon } from 'phosphor-react-native'

export const MAP_DEFAULTS = {
  fallbackCoordinate: [15.0, 54.0] as [number, number],
  fallbackZoom: 3.2,
  persistedGpsFallbackZoom: 11,
  maxZoom: 19,
  defaultPitch: 30,
  activePitch: 30,
  zoomDeltaMultiplier: 4,
  zoomDeltaFallback: 0.004,
  zoomDeltaMinAccuracy: 0.002,
  animationDuration: 350,
  followAnimationDuration: 450,
  pitchThreshold: 10,
  markerColor: '#7c6fef',
  markerInactiveColor: '#9ca3af',
  trailColor: '#7c6fef',
  trailWidth: 3,
  accuracyFillColor: 'rgba(124,111,239,0.18)',
  trailGradientStart: 'rgba(124,111,239,0)',
  trailGradientEnd: 'rgba(124,111,239,0.85)',
} as const

export const BLANK_STYLE = JSON.stringify({
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#111827' } }],
})

export const MAP_STYLES = [
  { key: 'onedark', label: 'One Dark', styleURL: null, Icon: MoonStarsIcon },
  { key: 'outdoors', label: 'Outdoors', styleURL: Mapbox.StyleURL.Outdoors, Icon: MountainsIcon },
  {
    key: 'satellite',
    label: 'Satellite',
    styleURL: Mapbox.StyleURL.SatelliteStreet,
    Icon: PlanetIcon,
  },
  { key: 'mapy', label: 'Mapy.cz', styleURL: null, Icon: MapTrifoldIcon },
] as const

export type MapStyleKey = (typeof MAP_STYLES)[number]['key']
