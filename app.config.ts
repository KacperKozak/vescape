import type { ExpoConfig } from 'expo/config'
import appJson from './app.json'

const config = appJson.expo as ExpoConfig
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY

export default (): ExpoConfig => ({
  ...config,
  android: {
    ...config.android,
    ...(googleMapsApiKey
      ? {
          config: {
            ...config.android?.config,
            googleMaps: {
              apiKey: googleMapsApiKey,
            },
          },
        }
      : {}),
  },
})
