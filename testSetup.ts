/**
 * Bun test preload — runs before any test file is loaded.
 * Mocks native modules that can't be evaluated in a Node.js test environment:
 * - react-native: uses Flow `import typeof` syntax bun cannot parse
 * - react-native-reanimated: imports React Native native/runtime APIs during module init
 * - expo-modules-core: calls requireNativeModule() which needs the Android runtime
 * - vesc-ble: our custom Expo module, also needs Android runtime
 */

import { mock } from 'bun:test'

mock.module('react-native', () => ({}))

mock.module('react-native-reanimated', () => ({
  makeMutable: <T>(value: T) => ({ value }),
}))

mock.module('expo-modules-core', () => ({
  requireNativeModule: (_name: string) => ({}),
  EventEmitter: class {
    addListener(_event: string, _cb: unknown) {
      return { remove: () => {} }
    }
  },
}))
