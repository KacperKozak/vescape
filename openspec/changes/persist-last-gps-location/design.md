## Context

The map component (`CenterMap.tsx`) initializes with `liveLocations.at(-1)` — the most recent GPS fix from the live buffer. When no fix exists (cold start), a `Camera` `defaultSettings` prop provides a fallback coordinate. However, due to a race in `@rnmapbox/maps`, the underlying MapView can render its internal default at `[0, 0]` (null island — Gulf of Guinea, off the coast of Africa) before the Camera component processes its props.

Settings are persisted through `AppSettings` — a strongly-typed Room entity on Android (`AppDataRepository.kt` → `app_settings` table) and a JSON dict in UserDefaults on iOS (`VescBleModule.swift`). Native owns last-location persistence; JS reads through `getSettings()`.

## Goals / Non-Goals

**Goals:**

- Map centers near user's actual location on cold start, before GPS lock.
- Coordinate persists across app restarts.
- Minimal write overhead — avoid hammering storage on every GPS tick.

**Non-Goals:**

- Persisting zoom level, bearing, or pitch — GPS accuracy determines zoom dynamically.
- Background location tracking — only persist during active GPS sessions.
- Persisting full location history — only the single most recent coordinate.

## Decisions

### 1. Store coordinates in `AppSettings` (not a separate store)

**Choice:** Add `lastGpsLatitude: Double?` and `lastGpsLongitude: Double?` to the existing `AppSettings` entity.

**Why:** The settings infrastructure already handles native persistence, JS bridging, and zustand hydration. No new storage layer needed. Two nullable floats are trivial additions.

**Alternative considered:** Dedicated MMKV/AsyncStorage key. Rejected — adds a new storage dependency and read path for two numbers.

### 2. Native writes latest location every 30 seconds

**Choice:** Persist the latest coordinate from the native location pipeline at most every 30 seconds.

**Why:** Native owns location updates and durable app data. JS lifecycle edges are unreliable for app close and reload, so JS should not be responsible for saving the last coordinate. Native throttling keeps write volume low during long sessions.

**Where:** Android writes from `VescForegroundService.onLocationUpdated()` through `AppDataRepository.updateLastGpsLocation()`. The iOS mock writes from its location timer into UserDefaults.

**Alternative considered:** JS listener persistence. Rejected after manual testing showed it was too dependent on JS lifecycle timing.

### 3. Map reads persisted coordinate via settingsStore

**Choice:** `CenterMap.tsx` reads `lastGpsLatitude`/`lastGpsLongitude` from `useSettingsStore` and uses them as fallback when `gpsFix` is null.

**Why:** Settings are loaded early in the app lifecycle (`settingsStore.load()` on mount). No additional async fetch needed.

**Fallback chain:** `gpsFix` → persisted coordinate → Europe overview.

### 4. Android Room migration (v6 → v7)

**Choice:** Add migration adding two nullable REAL columns to `app_settings` table.

**Why:** Room requires explicit migrations for schema changes. Nullable columns with ALTER TABLE ADD COLUMN are safe — no data loss, no default needed.

### 5. iOS — just add to defaults dict

**Choice:** Add new keys to `defaultSettings` dictionary with `NSNull()` defaults.

**Why:** iOS uses flexible `[String: Any]` storage via UserDefaults JSON. New keys are handled automatically by the merge-with-defaults pattern in `loadSettings()`.

### 6. Map fade-in to prevent null-island flash

**Choice:** Do not mount the map until `settingsStore.loaded` is true. Then keep the map container at `opacity: 0` until Mapbox reports the camera center is at the selected initial coordinate. Then animate opacity to 1 using `Animated.timing` (~200ms).

**Why:** Even with a persisted coordinate, `@rnmapbox/maps` may render a frame at `[0, 0]` before Camera processes props. Settings loaded only guarantees the fallback coordinate is known; the map must stay hidden until the native camera has actually moved.

**Alternative considered:** Settings-loaded-only fade gate. Rejected after manual testing showed it can still reveal the native map before the camera position is applied.

## Risks / Trade-offs

- **Stale coordinate after travel** → Acceptable. Even a day-old coordinate is better than null island. Gets overwritten at end of next GPS session.
- **First-ever launch has no persisted coordinate** → Falls back to Europe overview instead of a city-level default.
- **Room migration failure** → Standard ALTER TABLE ADD COLUMN is safe. If it fails, Room throws on DB open — same risk as any schema migration. Fallback strategy not needed for nullable columns.
