import type { ExpoConfig } from 'expo/config'
import pkg from './package.json'

const config: ExpoConfig = {
  name: 'vibe-wheel',
  slug: 'vibe-wheel',
  version: pkg.version,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vescpoc',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.anonymous.vescpoc',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#111827',
      foregroundImage: './assets/images/androidIconForeground.png',
      backgroundImage: './assets/images/androidIconBackground.png',
      monochromeImage: './assets/images/androidIconMonochrome.png',
    },
    predictiveBackGestureEnabled: false,
    package: 'com.anonymous.vescpoc',
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
