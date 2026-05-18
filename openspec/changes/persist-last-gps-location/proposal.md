## Why

When the app launches, the map centers on a hardcoded fallback coordinate (Wrocław, Poland) until the first GPS fix arrives. This causes a jarring jump — the user sees an irrelevant location for 1–5 seconds before the map snaps to their actual position. Persisting the last known GPS coordinate eliminates this cold-start flash.

## What Changes

- Persist the most recent GPS coordinate (latitude + longitude) to `AppSettings` via the existing native `AppDataRepository` storage.
- On map initialization, use the persisted coordinate as the fallback center instead of the hardcoded `[17.0385, 51.1079]`.
- Update the persisted coordinate periodically as new GPS fixes arrive (throttled to avoid excessive writes).
- Expose the persisted coordinate through the existing `settingsStore` so the map component can read it synchronously on mount.

## Capabilities

### New Capabilities

- `persist-last-gps`: Saving and restoring the last known GPS coordinate across app restarts for map initialization.

### Modified Capabilities

_(none — no existing spec-level behavior changes)_

## Impact

- **Native module** (`vesc-ble`): Add two new fields (`lastGpsLatitude`, `lastGpsLongitude`) to `AppSettings` interface and native `AppDataRepository` implementations (Android + iOS).
- **Settings store** (`settingsStore.ts`): Expose new fields, update defaults.
- **Map component** (`CenterMap.tsx`): Read persisted coordinate for fallback instead of hardcoded constant.
- **GPS ingestion** (`bleStore.ts` or `liveTelemetryRuntime.ts`): Throttled write of last coordinate to settings on each fix.
- **No breaking changes**. Graceful fallback to hardcoded coordinate if no persisted value exists.
