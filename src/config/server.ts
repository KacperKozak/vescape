/**
 * Base URL of the Vescape backend — the single server behind every networked
 * feature (the Group Ride relay today; more to come). It lives in a separate repo
 * (`../vescape-server`) and is deployed to `https://vescape.app`. Override per
 * environment with `EXPO_PUBLIC_SERVER_URL` (e.g. `http://localhost:3000` for a
 * local `bun dev` server).
 *
 * Expo layers `.env.local` into release bundles too, so `build:release` pins this
 * var to the prod URL — a dev localhost override can't leak into a shipped APK.
 */
export const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'https://vescape.app'

/** The backend base as a WebSocket origin: `http`→`ws`, `https`→`wss`. */
export const SERVER_WS_URL = SERVER_URL.replace(/^http/, 'ws')
