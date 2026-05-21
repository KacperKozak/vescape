const MAPY_API_KEY = process.env.EXPO_PUBLIC_MAPY_API_KEY ?? ''

export const MAPY_TILE_URL_TEMPLATE = `https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?lang=en&apikey=${MAPY_API_KEY}`

export const MAPBOX_ACCESS_TOKEN =
  process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ??
  'pk.eyJ1Ijoia2FjcGVya296YWsiLCJhIjoiY21venB0aHFjMDVhbjJxczZjcWg3cnZ2ZyJ9.q9k8NhFSnm7yRZ4HbFCmZA'
