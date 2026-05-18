## 1. Native: AppSettings Schema

- [x] 1.1 Add `lastGpsLatitude` (nullable Double) and `lastGpsLongitude` (nullable Double) to `AppSettingsEntity` in `AppDataRepository.kt`
- [x] 1.2 Add Room migration v6→v7: ALTER TABLE `app_settings` ADD COLUMN for both nullable REAL columns
- [x] 1.3 Add `lastGpsLatitude`/`lastGpsLongitude` branches to `updateSetting()` and include them in `toMap()` on Android
- [x] 1.4 Add `lastGpsLatitude`/`lastGpsLongitude` to iOS `defaultSettings` dict with `NSNull()` defaults in `VescBleModule.swift`

## 2. JS: AppSettings Interface

- [x] 2.1 Add `lastGpsLatitude: number | null` and `lastGpsLongitude: number | null` to `AppSettings` interface in `modules/vesc-ble/src/index.ts`
- [x] 2.2 Update `DEFAULTS` in `settingsStore.ts` with `lastGpsLatitude: null, lastGpsLongitude: null`

## 3. Native: Location Persistence

- [x] 3.1 Add Android `AppDataRepository.updateLastGpsLocation()` to update both coordinate columns together
- [x] 3.2 In `VescForegroundService`, persist any native location coordinate at most every 30 seconds
- [x] 3.3 In iOS mock location pipeline, persist mock GPS coordinates at most every 30 seconds
- [x] 3.4 Remove JS-side location persistence from `bleStore.ts`

## 4. JS: Map Fallback

- [x] 4.1 In `CenterMap.tsx`, read `lastGpsLatitude`/`lastGpsLongitude` from `useSettingsStore` and use as fallback center when `gpsFix` is null (before hardcoded coordinate)
- [x] 4.2 Update fallback usage to follow chain: live fix → persisted → Europe overview

## 5. JS: Map Fade-In

- [x] 5.1 In `CenterMap.tsx`, render map container with `opacity: 0` initially
- [x] 5.2 After `settingsStore.loaded` becomes true and Mapbox reports the camera is positioned, animate opacity from 0 to 1 (~200ms) using `Animated.timing`

## 6. Verification

- [x] 6.1 Build Android — verify Room migration runs clean
- [ ] 6.2 Test cold start: kill app, relaunch — map should fade in centered near last known location, no null-island flash
