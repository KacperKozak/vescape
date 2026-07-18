import { theme } from '@/constants/theme'

export const DEFAULT_SATELLITE_IMAGERY_OPACITY = 0.35

const SATELLITE_TEXT = theme.palette.slate.textSecondary
const SATELLITE_MUTED_TEXT = theme.palette.slate.light
const SATELLITE_HALO = 'hsl(0, 5%, 0%)'
const SATELLITE_SOFT_HALO = 'hsla(0, 5%, 0%, 0.75)'
const SATELLITE_ROAD = theme.palette.mono.white
const SATELLITE_PATH = theme.palette.mono.white

export function getSatelliteDarkMapStyle(
  imageryOpacity = DEFAULT_SATELLITE_IMAGERY_OPACITY,
  showPoiLabels = true,
  showPoiIcons = true,
  showDistrictLabels = true,
  showStreetLines = false,
) {
  const clampedImageryOpacity = Math.max(0.1, Math.min(1, imageryOpacity))
  const toneSatelliteImage = clampedImageryOpacity < 1

  return JSON.stringify({
    version: 8,
    name: 'Satellite Dark',
    sprite: 'mapbox://sprites/mapbox/streets-v12',
    glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        url: 'mapbox://mapbox.satellite',
        tileSize: 256,
      },
      composite: {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-streets-v8',
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': theme.palette.slate.surfaceDeep },
      },
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        paint: {
          'raster-opacity': clampedImageryOpacity,
          'raster-saturation': toneSatelliteImage ? -0.45 : 0,
          'raster-contrast': toneSatelliteImage ? -0.25 : 0,
        },
      },
      ...(showStreetLines
        ? [
            {
              id: 'road-path',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: ['all', ['==', ['get', 'class'], 'path']],
              paint: {
                'line-color': SATELLITE_PATH,
                'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.45, 18, 1.2],
                'line-dasharray': [2, 1.5],
                'line-opacity': 0.8,
              },
            },
            {
              id: 'road-track',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: ['==', ['get', 'class'], 'track'],
              paint: {
                'line-color': SATELLITE_PATH,
                'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 1.4, 18, 2],
                'line-dasharray': [3, 1.5],
                'line-opacity': 0.85,
              },
            },
            {
              id: 'road-service',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: ['==', ['get', 'class'], 'service'],
              paint: {
                'line-color': SATELLITE_ROAD,
                'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.45, 18, 2],
              },
            },
            {
              id: 'road-street',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: [
                'any',
                ['==', ['get', 'class'], 'street'],
                ['==', ['get', 'class'], 'street_limited'],
              ],
              paint: {
                'line-color': SATELLITE_ROAD,
                'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.35, 16, 1.8, 18, 3.4],
              },
            },
            {
              id: 'road-secondary-tertiary',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: [
                'any',
                ['==', ['get', 'class'], 'secondary'],
                ['==', ['get', 'class'], 'tertiary'],
              ],
              paint: {
                'line-color': SATELLITE_ROAD,
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.8, 18, 4.5],
              },
            },
            {
              id: 'road-primary',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: ['==', ['get', 'class'], 'primary'],
              paint: {
                'line-color': SATELLITE_ROAD,
                'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 14, 2.2, 18, 5.5],
              },
            },
            {
              id: 'road-trunk',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: ['==', ['get', 'class'], 'trunk'],
              paint: {
                'line-color': SATELLITE_ROAD,
                'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 12, 1.8, 18, 6],
              },
            },
            {
              id: 'road-motorway',
              type: 'line',
              source: 'composite',
              'source-layer': 'road',
              filter: ['==', ['get', 'class'], 'motorway'],
              paint: {
                'line-color': SATELLITE_ROAD,
                'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.55, 12, 2.4, 18, 7],
              },
            },
          ]
        : []),
      {
        id: 'water-label',
        type: 'symbol',
        source: 'composite',
        'source-layer': 'natural_label',
        filter: ['==', ['get', 'class'], 'water'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 13],
        },
        paint: {
          'text-color': 'hsl(240, 68%, 90%)',
          'text-halo-color': 'hsla(0, 0%, 0%, 0.5)',
          'text-halo-width': 1,
          'text-halo-blur': 1,
        },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'composite',
        'source-layer': 'road',
        minzoom: 13,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 9, 18, 13],
          'symbol-placement': 'line',
          'text-max-angle': 30,
        },
        paint: {
          'text-color': SATELLITE_TEXT,
          'text-halo-color': SATELLITE_HALO,
          'text-halo-width': 1,
          'text-halo-blur': 1,
        },
      },
      ...(showPoiIcons
        ? [
            {
              id: 'poi-icon',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'poi_label',
              minzoom: 6,
              layout: {
                'icon-image': [
                  'case',
                  ['has', 'maki_beta'],
                  ['coalesce', ['image', ['get', 'maki_beta']], ['image', ['get', 'maki']]],
                  ['image', ['get', 'maki']],
                ],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.65, 18, 0.9],
                'icon-allow-overlap': false,
                'icon-padding': 3,
              },
              paint: {
                'icon-color': SATELLITE_TEXT,
                'icon-halo-color': SATELLITE_HALO,
                'icon-halo-width': 1,
                'icon-opacity': 0.9,
              },
            },
            {
              id: 'transit-stop-icon',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'transit_stop_label',
              minzoom: 13,
              layout: {
                'icon-image': ['get', 'network'],
                'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 18, 0.95],
                'icon-allow-overlap': false,
                'icon-padding': 3,
              },
              paint: {
                'icon-color': SATELLITE_TEXT,
                'icon-halo-color': SATELLITE_HALO,
                'icon-halo-width': 1,
                'icon-opacity': 0.9,
              },
            },
          ]
        : []),
      ...(showPoiLabels
        ? [
            {
              id: 'poi-label',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'poi_label',
              minzoom: 14,
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
                'text-size': 11,
              },
              paint: {
                'text-color': SATELLITE_TEXT,
                'text-halo-color': SATELLITE_HALO,
                'text-halo-width': 0.5,
                'text-halo-blur': 0.5,
              },
            },
          ]
        : []),
      ...(showDistrictLabels
        ? [
            {
              id: 'place-label-region',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'place_label',
              minzoom: 3,
              maxzoom: 9,
              filter: [
                'any',
                ['==', ['get', 'class'], 'state'],
                ['==', ['get', 'class'], 'province'],
                ['==', ['get', 'type'], 'state'],
                ['==', ['get', 'type'], 'province'],
              ],
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 7, 13, 9, 15],
                'text-transform': 'uppercase',
                'text-letter-spacing': 0.08,
                'text-padding': 16,
              },
              paint: {
                'text-color': SATELLITE_MUTED_TEXT,
                'text-halo-color': SATELLITE_HALO,
                'text-halo-width': 1.5,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 6, 0.72, 9, 0.4],
              },
            },
            {
              id: 'place-label-subdivision',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'place_label',
              minzoom: 8,
              filter: [
                'any',
                ['==', ['get', 'class'], 'settlement_subdivision'],
                ['==', ['get', 'type'], 'settlement_subdivision'],
                ['==', ['get', 'type'], 'suburb'],
                ['==', ['get', 'type'], 'neighbourhood'],
                ['==', ['get', 'type'], 'neighborhood'],
                ['==', ['get', 'type'], 'quarter'],
              ],
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 8, 8, 12, 11, 15, 13],
                'text-padding': 18,
              },
              paint: {
                'text-color': SATELLITE_TEXT,
                'text-halo-color': SATELLITE_SOFT_HALO,
                'text-halo-width': 1.2,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 0.68, 15, 0.78],
              },
            },
            {
              id: 'place-label-town',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'place_label',
              minzoom: 8,
              filter: ['==', ['get', 'type'], 'town'],
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 14, 14],
                'text-padding': 8,
              },
              paint: {
                'text-color': SATELLITE_MUTED_TEXT,
                'text-halo-color': SATELLITE_HALO,
                'text-halo-width': 1.5,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.55, 10, 0.78, 14, 0.9],
              },
            },
            {
              id: 'place-label-village',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'place_label',
              minzoom: 11,
              filter: ['==', ['get', 'type'], 'village'],
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 11, 8, 15, 11],
                'text-padding': 14,
              },
              paint: {
                'text-color': SATELLITE_MUTED_TEXT,
                'text-halo-color': SATELLITE_HALO,
                'text-halo-width': 1.2,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 13, 0.55, 15, 0.72],
              },
            },
            {
              id: 'place-label-hamlet',
              type: 'symbol',
              source: 'composite',
              'source-layer': 'place_label',
              minzoom: 13,
              filter: ['==', ['get', 'type'], 'hamlet'],
              layout: {
                'text-field': ['get', 'name'],
                'text-font': ['DIN Pro Regular', 'Arial Unicode MS Regular'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 13, 7.5, 16, 10],
                'text-padding': 18,
              },
              paint: {
                'text-color': SATELLITE_MUTED_TEXT,
                'text-halo-color': SATELLITE_HALO,
                'text-halo-width': 1,
                'text-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.25, 15, 0.45, 16, 0.62],
              },
            },
          ]
        : []),
      {
        id: 'place-label-city',
        type: 'symbol',
        source: 'composite',
        'source-layer': 'place_label',
        filter: ['==', ['get', 'type'], 'city'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 18, 14, 22],
        },
        paint: {
          'text-color': SATELLITE_MUTED_TEXT,
          'text-halo-color': SATELLITE_HALO,
          'text-halo-width': 1,
          'text-halo-blur': 1,
        },
      },
      {
        id: 'place-label-country',
        type: 'symbol',
        source: 'composite',
        'source-layer': 'place_label',
        filter: ['==', ['get', 'class'], 'country'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 16],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
        },
        paint: {
          'text-color': SATELLITE_MUTED_TEXT,
          'text-halo-color': SATELLITE_SOFT_HALO,
          'text-halo-width': 1.25,
        },
      },
    ],
  })
}
