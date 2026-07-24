/**
 * Base URL of the Vescape backend — the single server behind every networked
 * feature (the Group Ride relay today; more to come). It lives in a separate repo
 * (`../vescape-server`) and is deployed to `https://vescape.app`. Override per
 * environment with `EXPO_PUBLIC_SERVER_URL` (e.g. `http://localhost:3000` for a
 * local `bun dev` server).
 *
 * Expo layers `.env.local` into release bundles too, so `build:release` pins this
 * var to the prod URL — a dev localhost override can't leak into a shipped APK.
 *
 * Native App Status fetches run before JS is ready, so both platforms hardcode the
 * production origin instead of receiving it from here.
 * @parity /modules/vescape-core/ios/appstatus/AppStatusCoordinator.swift `serverBaseUrl`
 * @parity /modules/vescape-core/android/src/main/java/expo/modules/vescapecore/appstatus/AppStatusCoordinator.kt `SERVER_BASE_URL`
 */
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://vescape.app'

/** Build the dedicated Group Ride WebSocket endpoint from the backend origin. */
export function toGroupRideWebSocketUrl(serverUrl: string) {
  return `${serverUrl.replace(/^http/, 'ws').replace(/\/+$/, '')}/ws/group-rides`
}

export const SERVER_WS_URL = toGroupRideWebSocketUrl(SERVER_URL)
