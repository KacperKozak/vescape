# Database Schema

SQLite via Room. File: `telemetry.db`. Version: 12. Fallback: destructive migration on failure.

8 tables. All timestamps epoch ms.

---

## telemetry_frames

Compressed raw telemetry. Delta-encoded with keyframes.

| column                  | type            | notes                                             |
| ----------------------- | --------------- | ------------------------------------------------- |
| id                      | INTEGER PK auto |                                                   |
| captured_at_ms          | INTEGER         | indexed                                           |
| elapsed_realtime_ms     | INTEGER         | Android monotonic clock                           |
| device_id               | TEXT?           | composite index with captured_at_ms               |
| device_name             | TEXT?           |                                                   |
| can_id                  | INTEGER?        |                                                   |
| flags                   | INTEGER         | bitflags: KEYFRAME=1, HAS_FAULT=2, HAS_LOCATION=4 |
| changed_mask_1          | INTEGER         | bitmask of which telemetry fields present         |
| changed_mask_2          | INTEGER         | bitmask of which location fields present          |
| speed_centi_kmh         | INTEGER?        | 0.01 km/h. null = unchanged from prev             |
| battery_voltage_mv      | INTEGER?        | millivolts                                        |
| motor_current_ma        | INTEGER?        | milliamps                                         |
| battery_current_ma      | INTEGER?        | milliamps                                         |
| duty_permille           | INTEGER?        | 0-1000                                            |
| pitch_centi_deg         | INTEGER?        | 0.01 deg                                          |
| roll_centi_deg          | INTEGER?        | 0.01 deg                                          |
| balance_pitch_centi_deg | INTEGER?        | 0.01 deg                                          |
| balance_current_ma      | INTEGER?        | milliamps                                         |
| erpm                    | INTEGER?        | electrical RPM                                    |
| state                   | INTEGER?        | board state code                                  |
| switch_state            | INTEGER?        | footpad switch                                    |
| adc1_milli              | INTEGER?        | footpad left, 0.001 units                         |
| adc2_milli              | INTEGER?        | footpad right, 0.001 units                        |
| odometer_cm             | INTEGER?        | centimeters                                       |
| temp_mosfet_deci_c      | INTEGER?        | 0.1 C                                             |
| temp_motor_deci_c       | INTEGER?        | 0.1 C                                             |
| fault_code              | INTEGER?        |                                                   |
| latitude_e7             | INTEGER?        | lat \* 1e7                                        |
| longitude_e7            | INTEGER?        | lon \* 1e7                                        |
| gps_speed_centi_mps     | INTEGER?        | 0.01 m/s                                          |
| bearing_centi_deg       | INTEGER?        | 0.01 deg                                          |
| accuracy_cm             | INTEGER?        | centimeters                                       |
| altitude_cm             | INTEGER?        | centimeters                                       |
| location_timestamp_ms   | INTEGER?        | GPS fix time                                      |

**Indices:** `captured_at_ms`; `(device_id, captured_at_ms)`; partial on `fault_code WHERE fault_code IS NOT NULL AND fault_code != 0` (created in onCreate callback)

**Keyframe rules:** every 60s, on gap detection, on first frame, after pending overflow

**State reconstruction:** find nearest keyframe before query start, replay frames forward applying non-null fields

---

## telemetry_minute_buckets

60s aggregates. PK: `(bucket_start_ms, device_id)`.

| column                         | type       | notes                                              |
| ------------------------------ | ---------- | -------------------------------------------------- |
| bucket_start_ms                | INTEGER PK | floor(captured_at_ms / 60000) \* 60000. indexed    |
| device_id                      | TEXT PK    | "" for unknown                                     |
| device_name                    | TEXT?      |                                                    |
| sample_count                   | INTEGER    |                                                    |
| first_sample_at_ms             | INTEGER    |                                                    |
| last_sample_at_ms              | INTEGER    |                                                    |
| sum_abs_speed_centi_kmh        | INTEGER    | for avg speed calc                                 |
| moving_speed_sample_count      | INTEGER?   | samples above speed threshold. null = pre-v10 data |
| sum_moving_abs_speed_centi_kmh | INTEGER?   | sum of moving speeds. null = pre-v10               |
| max_abs_speed_centi_kmh        | INTEGER    | peak speed                                         |
| min_battery_voltage_mv         | INTEGER?   |                                                    |
| max_motor_current_abs_ma       | INTEGER    |                                                    |
| max_battery_current_abs_ma     | INTEGER    |                                                    |
| battery_used_wh_milli          | INTEGER    | Wh \* 1000, discharge                              |
| battery_regen_wh_milli         | INTEGER    | Wh \* 1000, regen                                  |
| max_duty_abs_permille          | INTEGER    |                                                    |
| fault_count                    | INTEGER    |                                                    |
| first_odometer_cm              | INTEGER?   |                                                    |
| last_odometer_cm               | INTEGER?   |                                                    |
| gps_point_count                | INTEGER    |                                                    |
| precise_gps_point_count        | INTEGER    | GPS fixes >5s apart                                |
| gps_distance_cm                | INTEGER    | haversine sum                                      |
| max_gps_speed_centi_mps        | INTEGER?   |                                                    |

**Merge logic:** on conflict, existing bucket merges with new via min/max/sum per field. Handles late-arriving data.

**Energy calc:** trapezoidal V*I*dt. Max 5s sample gap. Positive = discharge, negative = regen.

---

## telemetry_markers

Session boundaries and gaps.

| column              | type            | notes                                                       |
| ------------------- | --------------- | ----------------------------------------------------------- |
| id                  | INTEGER PK auto |                                                             |
| occurred_at_ms      | INTEGER         | indexed                                                     |
| elapsed_realtime_ms | INTEGER         |                                                             |
| type                | TEXT            | `connected` / `disconnected` / `error` / `gap` / `app_stop` |
| device_id           | TEXT?           | composite index with occurred_at_ms                         |
| device_name         | TEXT?           |                                                             |
| message             | TEXT?           | error detail                                                |
| gap_ms              | INTEGER?        | gap duration for `gap` type                                 |

**Gap auto-detection:** sample gap >90s -> gap marker inserted automatically

**Session grouping:** markers + 10min gap threshold define ride boundaries for profile stats

---

## boards

| column      | type    | notes               |
| ----------- | ------- | ------------------- |
| id          | TEXT PK | UUID                |
| name        | TEXT    |                     |
| description | TEXT?   |                     |
| ble_id      | TEXT?   | BLE MAC for pairing |
| is_starred  | INTEGER | bool. indexed       |
| created_at  | INTEGER | indexed             |
| min_voltage | REAL?   | warning threshold   |
| max_voltage | REAL?   | warning threshold   |

**Sort:** `is_starred DESC, created_at ASC`

---

## alerts

| column        | type    | notes                           |
| ------------- | ------- | ------------------------------- |
| id            | TEXT PK | UUID                            |
| control_id    | TEXT    | telemetry field name. indexed   |
| threshold     | REAL    | lower bound                     |
| threshold_max | REAL?   | upper bound for geiger range    |
| enabled       | INTEGER | bool. indexed                   |
| sound_type    | TEXT    | preset URI (e.g. `preset:beep`) |
| created_at    | INTEGER | indexed                         |

---

## app_settings

Key-value override rows. Native owns schema, defaults, and validation. Missing key → default. Invalid/corrupt row → default + row deleted + Diagnostic Event emitted.

| column     | type        | notes                              |
| ---------- | ----------- | ---------------------------------- |
| key        | TEXT PK     |                                    |
| value_json | TEXT        | JSON-encoded scalar value          |
| updated_at | INTEGER     | epoch ms                           |

**Known keys and defaults** (defined in `AppSettings`/`AppDataRepository`):

| key                     | type     | default | notes                                                        |
| ----------------------- | -------- | ------- | ------------------------------------------------------------ |
| liveHistoryLimit        | Int      | 5       | minutes of recent telemetry kept in memory                   |
| autoConnect             | Boolean  | true    |                                                              |
| autoRecording           | Boolean  | false   |                                                              |
| selectedBoardId         | String?  | null    | auto-connect target                                          |
| lastGpsLatitude         | Double?  | null    |                                                              |
| lastGpsLongitude        | Double?  | null    |                                                              |
| movingSpeedThresholdKmh | Double   | 3.0     | cutoff for moving-average speed. JS aliases: `avgSpeedCutoffKmh`, `movingAvgSpeedThresholdKmh` |
| rainRadarEnabled        | Boolean  | false   |                                                              |

Writing a default-equivalent value deletes the override row.

---

## tune_profiles

| column      | type    | notes                                                |
| ----------- | ------- | ---------------------------------------------------- |
| id          | TEXT PK | UUID                                                 |
| board_id    | TEXT    | indexed. FK-like to boards.id                        |
| name        | TEXT    |                                                      |
| fields_json | TEXT    | JSON `Record<string, number\|boolean\|string\|null>` |
| created_at  | INTEGER |                                                      |
| updated_at  | INTEGER |                                                      |

**Constraint:** min 1 profile per board (enforced in DAO, not DB constraint)

---

## tune_history_entries

| column      | type            | notes                                |
| ----------- | --------------- | ------------------------------------ |
| id          | INTEGER PK auto |                                      |
| profile_id  | TEXT            | indexed. FK-like to tune_profiles.id |
| fields_json | TEXT            | snapshot before save                 |
| created_at  | INTEGER         | indexed                              |

**Created on:** every `saveProfile` and `rollbackProfile` call. Captures previous state.

**Query order:** `created_at DESC` (newest first)

---

## Constants

| constant                 | value   | used for                                   |
| ------------------------ | ------- | ------------------------------------------ |
| BUCKET_SIZE_MS           | 60,000  | minute bucket window                       |
| KEYFRAME_INTERVAL_MS     | 60,000  | max time between keyframes                 |
| GAP_BOUNDARY_MS          | 90,000  | auto gap marker threshold                  |
| PROFILE_SESSION_GAP_MS   | 600,000 | ride session boundary (10min)              |
| FLUSH_FRAME_COUNT        | 25      | frames before immediate flush              |
| FLUSH_DELAY_MS           | 5,000   | max delay before flush                     |
| MAX_PENDING_FRAMES       | 1,000   | in-memory queue cap. Oldest dropped        |
| DEFAULT_HISTORY_LIMIT    | 100     | bucket query default (max 500)             |
| DEFAULT_SAMPLE_LIMIT     | 2,000   | frame query default (max 10,000)           |
| MAX_ENERGY_SAMPLE_GAP_MS | 5,000   | skip energy calc if gap larger             |
| UNKNOWN_DEVICE_ID        | ""      | empty string for null device_id in buckets |
| DEFAULT_MOVING_SPEED     | 300     | 3.0 km/h in centi-km/h                     |

## Migrations

| version | change                                                                       |
| ------- | ---------------------------------------------------------------------------- |
| 3->4    | Add `app_settings`                                                           |
| 4->5    | Add `selected_board_id` to settings                                          |
| 5->6    | Add `battery_used_wh_milli`, `battery_regen_wh_milli` to buckets             |
| 6->7    | Add `last_gps_latitude`, `last_gps_longitude` to settings                    |
| 7->8    | Add `tune_profiles`, `tune_history_entries`                                  |
| 8->9    | Drop `history_locations`; clean empty buckets                                |
| 9->10   | Add `moving_speed_sample_count`, `sum_moving_abs_speed_centi_kmh` to buckets |
| 10->11  | Add `moving_avg_speed_threshold_kmh` to settings                             |
| 11->12  | Drop singleton `app_settings`; recreate as key-value override rows           |

Migrations before v3 not preserved. `fallbackToDestructiveMigration(true)` wipes DB if path missing.

## PRAGMA

`PRAGMA optimize` on every open.
