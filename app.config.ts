import type { ExpoConfig } from 'expo/config'
import pkg from './package.json'
import { androidVersionCode } from './src/helpers/version.ts'

const config: ExpoConfig = {
  name: 'vescape',
  slug: 'vibe-wheel',
  version: pkg.version,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vescape',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.vescape',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    versionCode: androidVersionCode(pkg.version),
    adaptiveIcon: {
      backgroundColor: '#111827',
      foregroundImage: './assets/images/androidIconForeground.png',
      backgroundImage: './assets/images/androidIconBackground.png',
      monochromeImage: './assets/images/androidIconMonochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: 'app.vescape',
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-dev-client',
      {
        toolsButton: false,
        skipOnboarding: true,
        showMenuAtLaunch: false,
      },
    ],
    [
      'expo-splash-screen',
      {
        image: './assets/images/splashIcon.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#111827',
        dark: {
          backgroundColor: '#111827',
        },
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 33,
        },
        ios: {
          deploymentTarget: '16.4',
        },
      },
    ],
    '@rnmapbox/maps',
    'expo-sharing',
    [
      'expo-media-library',
      {
        photosPermission:
          'Allow Vescape to show local photos and videos captured during selected rides.',
        granularPermissions: ['photo', 'video'],
      },
    ],
    'expo-video',
    'expo-image',
    './plugins/withGradleJvmArgs',
    './plugins/withWearMirror',
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: 'f8fcff68-4094-43c3-8eb0-9c1b291270e1',
    },
  },
}

export default config
