import { buildMapyTileUrlTemplate, getMapyApiKey } from '@/lib/map/mapyTiles'

const MAPY_API_KEY = getMapyApiKey(process.env.EXPO_PUBLIC_MAPY_API_KEY)

export const MAPY_TILE_URL_TEMPLATE = buildMapyTileUrlTemplate(MAPY_API_KEY)
export const IS_MAPY_CONFIGURED = MAPY_TILE_URL_TEMPLATE != null

export const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? ''
