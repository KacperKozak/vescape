# Telemetry Alerts

JS layer may be suspended during a ride. Alerts are evaluated natively so they fire regardless.

## Data flow

```
JS calls VescBle alert CRUD → native Room storage updates → VescForegroundService reloads rules
VescForegroundService: each BLE packet → evaluateAlerts() → ToneGenerator + Vibrator
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
| `sound_type`    | TEXT          | `'default'` only for now        |
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

Set `threshold_max` to add a range. Debounce shrinks linearly:

- at `threshold` → 1 s between beeps
- at `threshold_max` → 350 ms between beeps

Single threshold (no `threshold_max`) → fixed 10 s debounce.

When multiple alerts fire on the same packet, feedback rotates between them
so cross-control alerts (e.g. speed + duty) are each heard in turn.
Within a single evaluation, the most urgent alert is sorted first
(Geiger over simple; higher threshold for above-direction controls,
lower threshold for below-direction).

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
