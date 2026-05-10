import type { ExpoConfig } from 'expo/config'
import appJson from './app.json'

const config = appJson.expo as ExpoConfig

export default (): ExpoConfig => ({
  ...config,
})
