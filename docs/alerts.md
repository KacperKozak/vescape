# Telemetry Alerts

JS layer may be suspended during a ride. Alerts are evaluated natively so they fire regardless.

## Data flow

```
JS calls VescBle alert CRUD → native Room storage updates → VescForegroundService reloads rules
VescForegroundService: each BLE packet → evaluateAlerts() → SoundPool + Vibrator
Fired alerts embedded in that packet's telemetry map → visible in recentTelemetry
```

No separate event. No JS-side audio. Native storage is the source of truth.

## Schema — `alerts` table

| column          | type          | notes                           |
| --------------- | ------------- | ------------------------------- |
| `id`            | TEXT PK       | UUID                            |
| `control_id`    | TEXT          | see Control IDs below           |
| `threshold`     | REAL          | trigger point                   |
| `threshold_max` | REAL nullable | range upper bound (Geiger mode) |
| `enabled`       | INTEGER 0/1   | toggled by user                 |
| `sound_type`    | TEXT          | preset URI, e.g. `preset:beep`  |
| `created_at`    | INTEGER       | ms epoch                        |

## Control IDs & implicit direction

Direction is hardcoded per control — not stored.

| `control_id`      | direction | value used               |
| ----------------- | --------- | ------------------------ |
| `speed`           | above     | `abs(speed)` km/h        |
| `battery`         | **below** | `batteryVoltage` V       |
| `duty`            | above     | `abs(dutyCycle) × 100` % |
| `motor-temp`      | above     | `tempMotor` °C           |
| `motor-current`   | above     | `motorCurrent` A         |
| `controller-temp` | above     | `tempMosfet` °C          |
| `batt-current`    | above     | `batteryCurrent` A       |
| `imu`             | above     | `pitch` °                |
| `footpad`         | above     | `adc1`                   |

## Geiger mode

Set `threshold_max` to add a range. Active range alerts run a native SoundPool tick loop using the selected geiger preset. The interval shrinks linearly:

- at `threshold` → about 800 ms between ticks
- at `threshold_max` → the selected geiger preset loops continuously

Single threshold (no `threshold_max`) → fixed 10 s debounce.

When multiple alerts fire on the same packet, SoundPool lets their clips or geiger loops overlap.
Within a single evaluation, the most urgent alert is sorted first for telemetry display
(Geiger over simple; higher threshold for above-direction controls, lower threshold for below-direction).

## JS side

```ts
// store — backed by native VescBle APIs
useAlertsStore.getState().load()        // on app mount
store.add(controlId, threshold, thresholdMax?)
store.toggle(id)
store.remove(id)

// fired alerts arrive on every matching telemetry packet
onTelemetry: (e) => e.firedAlerts?.forEach(a => ...)
```

Native alert mutations reload foreground-service rules after writing.

## iOS

The current iOS module is still a simulator mock. It persists alert rules for UI parity but does not run real alert evaluation.
