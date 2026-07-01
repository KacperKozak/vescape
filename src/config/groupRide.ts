/**
 * Group Ride relay server endpoint. The relay is an external service (separate repo)
 * deployed to `wss://vescape.app`; override per-environment with
 * `EXPO_PUBLIC_GROUP_RIDE_SERVER_URL` (e.g. a local dev server).
 */
export const GROUP_RIDE_SERVER_URL =
  process.env.EXPO_PUBLIC_GROUP_RIDE_SERVER_URL ?? 'wss://vescape.app'
