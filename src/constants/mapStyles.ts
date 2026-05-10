import Mapbox from '@rnmapbox/maps'
import {
  MapTrifoldIcon,
  MoonStarsIcon,
  MountainsIcon,
  PlanetIcon,
  type Icon,
} from 'phosphor-react-native'

export const FALLBACK_COORDINATE: [number, number] = [17.0385, 51.1079]

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

export interface MapStyleConfig {
  key: MapStyleKey
  label: string
  styleURL: string | null
  Icon: Icon
}
