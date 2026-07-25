import {
  AndroidConfig,
  withAndroidManifest,
  withInfoPlist,
  type ConfigPlugin,
} from 'expo/config-plugins'

/**
 * Bakes the Vescape backend origin into both native projects at prebuild time.
 *
 * Native fetches App Status before the JS runtime exists, so it cannot read `EXPO_PUBLIC_SERVER_URL`
 * the way JS does. Prebuild can: it runs in a shell that has already loaded `.env`/`.env.local`, so
 * the value is written into the Android manifest and the iOS Info.plist and read back natively.
 * Unset → production, which is also what `build:release` pins.
 *
 * Changing `.env` therefore needs a fresh prebuild — `scripts/native-sync.ts` fingerprints the env
 * files so `bun run android` / `bun run ios` do that on their own.
 *
 * An http origin (a local `bun dev` server) additionally gets an ATS exception on iOS; Android debug
 * builds already allow cleartext.
 *
 * @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `SERVER_BASE_URL_METADATA`
 * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift `serverBaseUrlInfoKey`
 */
const ANDROID_METADATA_NAME = 'app.vescape.SERVER_BASE_URL'
const IOS_INFO_PLIST_KEY = 'VescapeServerBaseUrl'
const PRODUCTION_SERVER_URL = 'https://api.vescape.app'

const withServerOrigin: ConfigPlugin = (config) => {
  const serverUrl = process.env.EXPO_PUBLIC_SERVER_URL || PRODUCTION_SERVER_URL

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, ANDROID_METADATA_NAME, serverUrl)
    return cfg
  })

  return withInfoPlist(config, (cfg) => {
    cfg.modResults[IOS_INFO_PLIST_KEY] = serverUrl

    const { protocol, hostname } = new URL(serverUrl)
    if (protocol === 'http:') {
      cfg.modResults.NSAppTransportSecurity = {
        ...(cfg.modResults.NSAppTransportSecurity as Record<string, unknown> | undefined),
        NSExceptionDomains: {
          [hostname]: { NSExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: true },
        },
      }
    }
    return cfg
  })
}

export default withServerOrigin
