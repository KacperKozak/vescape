# Native API

JS bridge surface exposed by `VescBle` Expo module. Android: full impl. iOS: simulator mock (UserDefaults, no DB).

Source of truth: `modules/vesc-ble/src/index.ts` (types), `VescBleModule.kt` (Android), `VescBleModule.swift` (iOS mock).

## Term map

| Domain (CONTEXT.md) | Native/API name                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| Board               | `device_id` in DB, `boardId` in API                                    |
| Telemetry Sample    | `telemetry_frames` (DB), `TelemetrySample` (JS)                        |
| Ride Recording      | frames + buckets + markers in DB                                       |
| Ride History        | `getTelemetryHistory` (buckets), `getHistoryRange` (full)              |
| Tune Profile        | `tune_profiles` table, `TuneProfile` type                              |
| Tune Snapshot       | `RefloatConfigSnapshot`                                                |
| Alert Rule          | `alerts` table, `AlertRule` type                                       |
| User Profile Stats  | `ProfileStats` type, `getTotalProfileStats` / `getMonthlyProfileStats` |

---

## Scan

| fn           | sync | returns                                         |
| ------------ | ---- | ----------------------------------------------- |
| `scan()`     | sync | void. Emits `onDevice` events per advertisement |
| `stopScan()` | sync | void                                            |

## Location

| fn                       | sync | returns                                                |
| ------------------------ | ---- | ------------------------------------------------------ |
| `startLocationUpdates()` | sync | void. Emits `onLocation`. Independent of board session |
| `stopLocationUpdates()`  | sync | void                                                   |

## Board session

| fn                                  | sync  | returns                                                                                                                                         |
| ----------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `selectBoard(boardId)`              | async | void. Native reads the Board Link from DB, owns connect. Emits `onLiveState`, `onTelemetry`                                                     |
| `stopBoard()`                       | async | void. GPS may continue independently                                                                                                            |
| `probeBoardLink(bleId)`             | async | `BoardProbeResult`. Probes a peripheral, returns `BoardCandidate[]` (transport + `hasBms`) confirmed by telemetry. Emits `onBoardProbeProgress` |
| `getLiveState()`                    | sync  | `LiveStateEvent`. UI should mirror, not invent state                                                                                            |
| `setSelectedBoard(boardId \| null)` | sync  | void. Persists auto-connect target. Native uses while JS frozen                                                                                 |

### LiveStateEvent shape

```ts
{
  board: { phase, selectedBoardId, connectedBoardId, bleId, name,
           connectionSeq, lastTelemetryAt, recentTelemetry[], error, autoConnect }
  gps:   { phase, latestFix, latestApproximateFix?, latestPreciseFix?, recentLocations[], error }
  scan:  { phase, devices[], error }
  recording: { enabled, activeBoardId, startedAt }
}
```

Phases: `idle|connecting|discovering|subscribing|waiting_for_telemetry|connected|stale|reconnecting|disconnecting|error`

## Telemetry recording

| fn                                      | sync | returns                    |
| --------------------------------------- | ---- | -------------------------- |
| `setTelemetryRecordingEnabled(enabled)` | sync | void. Toggle SQLite writes |

### Write pipeline internals

1. BLE packet -> `TelemetryCapture` (human units)
2. Scale to integer state (`FullTelemetryState`) for lossless storage
3. Delta-encode against previous -> `TelemetryFrameEntity` (nulls = unchanged)
4. Keyframe every 60s or on gap. Flags: `KEYFRAME=1, HAS_FAULT=2, HAS_LOCATION=4`
5. Queue in-memory (max 1000 pending). Flush on 25 frames or 5s delay
6. On flush: insert frames + upsert buckets (60s aggregates) + insert markers
7. Gap marker auto-inserted when sample gap > 90s

### Delta encoding thresholds

Field omitted (null) when change < threshold from previous:

| field                   | threshold                                       |
| ----------------------- | ----------------------------------------------- |
| speed                   | 5 centi-km/h                                    |
| voltage                 | 20 mV                                           |
| motor/battery current   | 100 mA                                          |
| duty                    | 2 permille                                      |
| pitch/roll/balancePitch | 5 centi-deg                                     |
| balance current         | 100 mA                                          |
| adc1/adc2               | 10 milli                                        |
| odometer                | 25 cm                                           |
| temp mosfet/motor       | 5 deci-C                                        |
| location                | >2m moved OR >2m accuracy change OR >5s elapsed |

## Telemetry queries

| fn                                                    | returns                                                                    | notes                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `getTelemetryHistory(opts?)`                          | `TelemetryMinuteBucket[]`                                                  | 60s bucket aggregates. Pagination via `cursorBeforeMs`. Default limit 100, max 500                |
| `getTelemetrySamples({fromMs,toMs,deviceId?,limit?})` | `TelemetrySample[]`                                                        | Decoded from compressed frames. Reconstructs state from nearest keyframe. Default 2000, max 10000 |
| `getHistoryRange({fromMs,toMs,deviceId?,limit?})`     | `{boardSamples, gpsSamples, markers}`                                      | Combined query: decoded samples + GPS points + session markers                                    |
| `getTelemetrySummary()`                               | `{sampleCount, gpsPointCount, firstAtMs, lastAtMs, droppedPendingSamples}` | DB-wide stats                                                                                     |
| `getDatabaseSizeBytes()`                              | number                                                                     | File size of telemetry.db                                                                         |

### TelemetryMinuteBucket (bucket shape)

```ts
{
  id, startAtMs, endAtMs, bucketStartMs, deviceId, deviceName,
  sampleCount, gpsPointCount, preciseGpsPointCount,
  maxAbsSpeedKmh, maxGpsSpeedKmh?, avgSpeedKmh, avgSpeedSampleCount,
  minBatteryVoltage?, maxMotorCurrent, maxBatteryCurrent, maxDuty,
  faultCount, distanceDeltaM?, gpsDistanceM?,
  maxTempMosfet?, maxTempMotor?,
  firstLatitude?, firstLongitude?,
  boundaryBefore: 'none'|'connected'|'disconnected'|'error'|'gap'|'app_stop',
  boundaryMessage?, gapBeforeMs?
}
```

### TelemetrySample (decoded frame shape)

```ts
{
  id, capturedAtMs, deviceId, deviceName,
  speedKmh, batteryVoltage, motorCurrent, batteryCurrent, dutyCycle,
  pitch, roll, balancePitch, balanceCurrent, erpm,
  state, switchState, adc1, adc2, odometer?,
  tempMosfet?, tempMotor?, hasFault, faultCode,
  latitude?, longitude?
}
```

## Telemetry deletion

| fn                                              | returns                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| `deleteTelemetryBefore(beforeMs)`               | frames deleted count. Also deletes matching markers + buckets     |
| `deleteTelemetryRange({fromMs,toMs,deviceId?})` | frames deleted count. Flushes pending first                       |
| `clearTelemetryHistory()`                       | void. Wipes all frames, markers, buckets + resets in-memory state |

## User Profile Stats

| fn                                     | returns                                      |
| -------------------------------------- | -------------------------------------------- |
| `getTotalProfileStats()`               | `ProfileStats` across all rides              |
| `getMonthlyProfileStats({year,month})` | `ProfileStats` for one month                 |
| `getProfileStatMonths()`               | `{year,month}[]` desc. Months with ride data |

### ProfileStats shape

```ts
{ distanceM?, rideCount, rideTimeMs, topSpeedKmh, avgSpeedKmh, longestRideM?, batteryUsedWh?, batteryRegenWh? }
```

### Session grouping logic (internals)

Rides computed from buckets + markers:

- New session on: device change, gap >10min, or boundary marker (`disconnected`/`app_stop`/`error`)
- Moving avg speed uses `movingSpeedThresholdKmh` setting (default 3.0 km/h) to exclude stopped samples
- Distance prefers odometer delta, falls back to GPS distance
- Energy: trapezoidal integration (V*I*dt), max 5s sample gap

## Boards

| fn                   | sync  | returns                            |
| -------------------- | ----- | ---------------------------------- |
| `getBoards()`        | async | `Board[]` sorted by created_at ASC |
| `upsertBoard(board)` | async | void                               |
| `deleteBoard(id)`    | async | void                               |

### Board shape

```ts
{ id, name, description?, createdAt, batteryConfig?, link: { bleId, transport } | null }
```

A **Board Link** is saved whole or not at all: it always carries a proven BLE peripheral id
plus a Board Transport (`'direct'` | CAN id). `link: null` means the board is unlinked
(offline-only). Mutable per-board fields (`description`, `batteryConfig`, `transport`) live in
the `board_settings` key-value table; the `boards` row holds only stable identity (`id`, `name`,
`ble_id`, `created_at`).

## Alert rules

| fn                                            | sync  | returns                                                        |
| --------------------------------------------- | ----- | -------------------------------------------------------------- |
| `getAlertRules()`                             | async | `AlertRule[]` by created_at ASC                                |
| `upsertAlertRule(rule)`                       | async | void. Reloads foreground service rules                         |
| `setAlertRuleEnabled(id,enabled)`             | async | void. Reloads rules                                            |
| `deleteAlertRule(id)`                         | async | void. Reloads rules                                            |
| `getAlertPresets()`                           | sync  | `AlertPreset[]`. Falls back to hardcoded if native unavailable |
| `previewAlertSound(soundType)`                | sync  | void                                                           |
| `startGeigerSimulation(soundType,rangeDepth)` | sync  | void                                                           |
| `stopGeigerSimulation()`                      | sync  | void                                                           |
| `reloadAlertRules()`                          | sync  | void. Force foreground service re-read                         |

### AlertRule shape

```ts
{ id, controlId, threshold, thresholdMax?, enabled, soundType, createdAt }
```

Single threshold -> one-shot alert. Both threshold+thresholdMax -> geiger (progressive ticking).

### AlertPreset shape

```ts
{ name, uri, category: 'single'|'geiger' }
```

Presets: beep, urgent, notify (single); tick, tick_hard, gamma (geiger)

## Tune profiles

| fn                                                    | returns                                                    |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `getTuneProfiles(boardId)`                            | `TuneProfile[]`                                            |
| `getTuneProfile(profileId)`                           | `TuneProfile?`                                             |
| `createProfile(boardId,name,fields)`                  | `TuneProfile`                                              |
| `renameProfile(profileId,name)`                       | `TuneProfile`                                              |
| `deleteProfile(profileId)`                            | void. Fails if last profile for board                      |
| `saveProfile(profileId,fields)`                       | `TuneProfile`. Creates history entry before save           |
| `getProfileHistory(profileId)`                        | `TuneHistoryEntry[]` newest-first                          |
| `rollbackProfile(profileId,historyEntryId)`           | `TuneProfile`. Snapshots current before rollback           |
| `copyProfileToBoard(profileId,targetBoardId,newName)` | `TuneProfile` on target board                              |
| `pushProfileToBoard(profileId)`                       | `RefloatConfigSnapshot`. Writes to connected board via BLE |
| `getRefloatConfigSnapshot()`                          | `RefloatConfigSnapshot`. Reads current board config        |

### TuneProfile shape

```ts
{ id, boardId, name, fields: Record<string, number|boolean|string|null>, createdAt, updatedAt }
```

### RefloatConfigSnapshot shape

```ts
{ capturedAt, boardId?, canId, schemaHash, rawConfigHash, rawConfigLength,
  groups: { id, title, fields: { id, label, value, unit?, min?, max? }[] }[],
  missingFieldIds[], fwVersion? }
```

## Settings

| fn                         | returns                                                  |
| -------------------------- | -------------------------------------------------------- |
| `getSettings()`            | `AppSettings`                                            |
| `updateSetting(key,value)` | void. `liveHistoryLimit` also updates foreground service |

### AppSettings shape

```ts
{ liveHistoryLimit, autoConnect, autoRecording, selectedBoardId?,
  lastGpsLatitude?, lastGpsLongitude?, movingSpeedThresholdKmh }
```

Valid keys: `liveHistoryLimit`, `autoConnect`, `autoRecording`, `selectedBoardId`, `lastGpsLatitude`, `lastGpsLongitude`, `movingSpeedThresholdKmh` (aliases: `avgSpeedCutoffKmh`, `movingAvgSpeedThresholdKmh`)

Writing default-equivalent value deletes the override row. Unknown keys and type mismatches are silently ignored.

## Diagnostics

| fn                                      | sync | returns                                  |
| --------------------------------------- | ---- | ---------------------------------------- |
| `setDebugRecordingEnabled(enabled)`     | yes  | void. Android only                       |
| `listDebugRecordings()`                 | no   | `{ name, createdAt, sizeBytes }[]`       |
| `exportDebugRecording(name)`            | no   | `{ uri, name, sizeBytes }`. Android only |
| `reportUiError(message,source?,stack?)` | yes  | void                                     |
| `reportDiagnosticTest()`                | yes  | `DiagnosticStatus`                       |
| `getDiagnosticStatus()`                 | yes  | `DiagnosticStatus`                       |

### DiagnosticStatus shape

```ts
{ enabled, host, distinctId?, captureCount, lastEventName?, lastCaptureAt? }
```

## Events

| event         | payload                            | when                                                                                                             |
| ------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `onDevice`    | `{id, name, rssi, serviceUUIDs[]}` | BLE scan advertisement                                                                                           |
| `onError`     | `{message}`                        | Native error                                                                                                     |
| `onLiveState` | `LiveStateEvent`                   | Connection/GPS/scan/recording state change                                                                       |
| `onTelemetry` | `TelemetryEvent`                   | Real-time board data. Includes `firedAlerts[]`                                                                   |
| `onBms`       | `BmsEvent`                         | Smart-BMS cell-group values, ~1/8 telemetry rate. See [vescProtocol.md](./vescProtocol.md#bms-cell-group-values) |
| `onLocation`  | `LocationEvent`                    | GPS fix from `startLocationUpdates()`                                                                            |

### TelemetryEvent shape (live, not history)

```ts
{ generation?, location?, hasFault, faultCode,
  pitch, roll, balancePitch, balanceCurrent,
  speed, batteryVoltage, motorCurrent, batteryCurrent, erpm, dutyCycle,
  state, stateName, switchState, adc1, adc2, odometer?, tempMosfet?, tempMotor?,
  avgLatency?, lastPacketAt, firedAlerts?: FiredAlert[] }
```

Live event has `stateName` + `avgLatency` + `firedAlerts`. History `TelemetrySample` does not.

### BmsEvent shape

```ts
{ capturedAt, voltageTotal, current, ampHours, wattHours,
  soc: number | null,        // 0–1, null when firmware omits it
  cellVoltages: number[],    // per cell-group, volts
  balancing: boolean[] }      // per cell-group, aligned with cellVoltages
```

Not persisted to history and not fed into alerts. `bleStore` keeps only the latest
snapshot (`latestBms`); UI derives min/max/spread via `summarizeBms` in `src/lib/battery/bms.ts`.
