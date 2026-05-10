export const ONE_DARK_MAP_STYLE = JSON.stringify({
  version: 8,
  name: 'One Dark',
  sources: {
    composite: {
      url: 'mapbox://mapbox.mapbox-streets-v8',
      type: 'vector',
    },
  },
  glyphs: 'mapbox://fonts/mapbox/{fontstack}/{range}.pbf',
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#2b3040' },
    },

    // --- landcover ---
    {
      id: 'landcover-grass',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'grass'],
      paint: {
        'fill-color': '#2d3a2e',
        'fill-opacity': 0.6,
      },
    },
    {
      id: 'landcover-wood',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'wood'],
      paint: {
        'fill-color': '#263329',
        'fill-opacity': 0.7,
      },
    },
    {
      id: 'landcover-scrub',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landcover',
      filter: ['==', ['get', 'class'], 'scrub'],
      paint: {
        'fill-color': '#2a3329',
        'fill-opacity': 0.5,
      },
    },

    // --- landuse (parks, forests, cemeteries) ---
    {
      id: 'landuse-park',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'park'],
      paint: {
        'fill-color': '#2a3d2c',
        'fill-opacity': 0.65,
      },
    },
    {
      id: 'landuse-park-outline',
      type: 'line',
      source: 'composite',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'park'],
      paint: {
        'line-color': '#4a7a50',
        'line-width': 1.2,
        'line-opacity': 0.7,
      },
    },
    {
      id: 'landuse-forest',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landuse',
      filter: [
        'any',
        ['==', ['get', 'class'], 'national_park'],
        ['==', ['get', 'class'], 'nature_reserve'],
      ],
      paint: {
        'fill-color': '#243528',
        'fill-opacity': 0.7,
      },
    },
    {
      id: 'landuse-forest-outline',
      type: 'line',
      source: 'composite',
      'source-layer': 'landuse',
      filter: [
        'any',
        ['==', ['get', 'class'], 'national_park'],
        ['==', ['get', 'class'], 'nature_reserve'],
      ],
      paint: {
        'line-color': '#4a7a50',
        'line-width': 1,
        'line-opacity': 0.6,
      },
    },
    {
      id: 'landuse-cemetery',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'cemetery'],
      paint: {
        'fill-color': '#2e3335',
        'fill-opacity': 0.5,
      },
    },
    {
      id: 'landuse-hospital',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'hospital'],
      paint: {
        'fill-color': '#3a2d35',
        'fill-opacity': 0.5,
      },
    },
    {
      id: 'landuse-school',
      type: 'fill',
      source: 'composite',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'school'],
      paint: {
        'fill-color': '#35302a',
        'fill-opacity': 0.5,
      },
    },

    // --- water ---
    {
      id: 'water',
      type: 'fill',
      source: 'composite',
      'source-layer': 'water',
      paint: {
        'fill-color': '#1a2535',
      },
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'composite',
      'source-layer': 'waterway',
      paint: {
        'line-color': '#1e2d42',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2, 18, 4],
      },
    },

    // --- roads ---
    {
      id: 'road-path',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['all', ['==', ['get', 'class'], 'path']],
      paint: {
        'line-color': '#5c6370',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 2],
        'line-dasharray': [2, 1.5],
        'line-opacity': 0.7,
      },
    },
    {
      id: 'road-track',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['==', ['get', 'class'], 'track'],
      paint: {
        'line-color': '#6b7280',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 16, 2.5, 18, 3.5],
        'line-dasharray': [3, 1.5],
        'line-opacity': 0.8,
      },
    },
    {
      id: 'road-service',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['==', ['get', 'class'], 'service'],
      paint: {
        'line-color': '#3e4451',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 4],
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
        'line-color': '#3e4451',
        'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 3, 18, 7],
      },
    },
    {
      id: 'road-secondary-tertiary',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['any', ['==', ['get', 'class'], 'secondary'], ['==', ['get', 'class'], 'tertiary']],
      paint: {
        'line-color': '#464d5e',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 3, 18, 10],
      },
    },
    {
      id: 'road-primary',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['==', ['get', 'class'], 'primary'],
      paint: {
        'line-color': '#505872',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 4, 18, 13],
      },
    },
    {
      id: 'road-trunk',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['==', ['get', 'class'], 'trunk'],
      paint: {
        'line-color': '#565e72',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 3, 18, 14],
      },
    },
    {
      id: 'road-motorway',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: ['==', ['get', 'class'], 'motorway'],
      paint: {
        'line-color': '#5a6480',
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 4, 18, 16],
      },
    },

    // --- rail ---
    {
      id: 'road-rail',
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: [
        'any',
        ['==', ['get', 'class'], 'major_rail'],
        ['==', ['get', 'class'], 'minor_rail'],
      ],
      paint: {
        'line-color': '#5c6370',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 1.5],
        'line-dasharray': [4, 2],
        'line-opacity': 0.6,
      },
    },

    // --- buildings ---
    {
      id: 'building',
      type: 'fill',
      source: 'composite',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-color': '#353b48',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.5, 16, 0.7],
      },
    },
    {
      id: 'building-outline',
      type: 'line',
      source: 'composite',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'line-color': '#444c5e',
        'line-width': 0.5,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.4],
      },
    },

    // --- admin boundaries ---
    {
      id: 'admin-1-boundary',
      type: 'line',
      source: 'composite',
      'source-layer': 'admin',
      filter: ['==', ['get', 'admin_level'], 1],
      paint: {
        'line-color': '#5c6370',
        'line-width': 1.2,
        'line-dasharray': [4, 3],
        'line-opacity': 0.5,
      },
    },
    {
      id: 'admin-0-boundary',
      type: 'line',
      source: 'composite',
      'source-layer': 'admin',
      filter: ['all', ['==', ['get', 'admin_level'], 0], ['!=', ['get', 'maritime'], 1]],
      paint: {
        'line-color': '#7a8291',
        'line-width': 1.5,
        'line-opacity': 0.6,
      },
    },

    // --- labels ---
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
        'text-color': '#3d6080',
        'text-halo-color': '#1a2535',
        'text-halo-width': 1,
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
        'text-color': '#7a8291',
        'text-halo-color': '#2b3040',
        'text-halo-width': 1.5,
      },
    },
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
        'text-color': '#6b7280',
        'text-halo-color': '#2b3040',
        'text-halo-width': 1,
      },
    },
    {
      id: 'place-label-town',
      type: 'symbol',
      source: 'composite',
      'source-layer': 'place_label',
      filter: [
        'any',
        ['==', ['get', 'class'], 'town'],
        ['==', ['get', 'class'], 'village'],
        ['==', ['get', 'class'], 'hamlet'],
      ],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9, 14, 15],
      },
      paint: {
        'text-color': '#8a919e',
        'text-halo-color': '#2b3040',
        'text-halo-width': 1.5,
      },
    },
    {
      id: 'place-label-city',
      type: 'symbol',
      source: 'composite',
      'source-layer': 'place_label',
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 18, 14, 22],
      },
      paint: {
        'text-color': '#abb2bf',
        'text-halo-color': '#2b3040',
        'text-halo-width': 2,
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
        'text-color': '#7a8291',
        'text-halo-color': '#2b3040',
        'text-halo-width': 2,
      },
    },
  ],
} as const)
