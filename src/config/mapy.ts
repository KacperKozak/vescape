export const MAPY_API_KEY =
  process.env.EXPO_PUBLIC_MAPY_API_KEY ?? 'SqV-OuVnM3Hq_5h7a34MvZ-rd4NEfwYlwlPLBwAd084'

export const MAPY_TILE_URL_TEMPLATE = `https://api.mapy.com/v1/maptiles/outdoor/256/{z}/{x}/{y}?lang=en&apikey=${MAPY_API_KEY}`

export const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'AIzaSyBJc0my-qrvXZyamo6ghgAp3Y4YYirPlvU'
