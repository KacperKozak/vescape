import type { ExpoConfig } from 'expo/config'
import pkg from './package.json' with { type: 'json' }
import { androidVersionCode } from './src/helpers/version.ts'

const config: ExpoConfig = {
  name: 'vescape',
  slug: 'vescape',
  version: pkg.version,
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'vescape',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.vescape',
    // Required by @bacons/apple-targets to sign the ride-activity widget extension. Account-specific
    // 10-char Apple Developer team ID — set APPLE_TEAM_ID at prebuild/build time (EAS secret / .env).
    appleTeamId: process.env.APPLE_TEAM_ID,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSBluetoothAlwaysUsageDescription:
        'Allow Vescape to connect to your board over Bluetooth for live telemetry, alerts, and ride recording.',
      NSLocationWhenInUseUsageDescription:
        'Allow Vescape to use your location for live maps, ride recording, and reconnect support while you ride.',
      UIBackgroundModes: ['bluetooth-central', 'location', 'audio'],
      // Board Session status surface — native-driven Live Activity (peer of Android's persistent
      // foreground notification). See targets/ride-activity + plugins/withLiveActivityAttributes.
      NSSupportsLiveActivities: true,
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
    // Play's Photo and Video Permissions policy rejected READ_MEDIA_*; ride media uses the
    // permissionless system photo picker instead. The storage pair is minSdk<=32 only and
    // this app's minSdk is 33, so all of these are stripped from the merged manifest.
    blockedPermissions: [
      'android.permission.READ_MEDIA_IMAGES',
      'android.permission.READ_MEDIA_VIDEO',
      'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    '@clerk/expo',
    'expo-secure-store',
    [
      '@sentry/react-native/expo',
      {
        // Falls back to SENTRY_ORG / SENTRY_PROJECT env vars during builds;
        // source-map upload additionally needs SENTRY_AUTH_TOKEN.
        organization: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
      },
    ],
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
    '@bacons/apple-targets',
    '@rnmapbox/maps',
    'expo-sharing',
    [
      'expo-image-picker',
      {
        // System photo picker only — no camera/mic use, and no READ_MEDIA_* permissions on
        // Android (Play Photo and Video Permissions policy).
        photosPermission: 'Allow Vescape to attach local photos and videos to selected rides.',
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    'expo-video',
    'expo-image',
    './plugins/withGradleJvmArgs',
    './plugins/withWearMirror',
    './plugins/withSentryNativeInit',
    './plugins/withAndroidSigningConfig',
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
