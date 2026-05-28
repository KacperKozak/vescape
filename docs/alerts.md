# Telemetry Alerts

JS layer may be suspended during a ride. Alerts are evaluated natively so they fire regardless.

## Data flow

```
JS calls VescBle alert CRUD → native Room storage updates → VescForegroundService reloads rules
VescForegroundService: each BLE packet → evaluateAlerts() → SoundPool/TextToSpeech + Vibrator
Fired alerts embedded in that packet's telemetry map → visible in recentTelemetry
```

No separate event. No JS-side audio. Native storage is the source of truth.

## Schema — `alerts` table

| column          | type          | notes                                                          |
| --------------- | ------------- | -------------------------------------------------------------- |
| `id`            | TEXT PK       | UUID                                                           |
| `control_id`    | TEXT          | see Control IDs below                                          |
| `threshold`     | REAL          | trigger point                                                  |
| `threshold_max` | REAL nullable | range upper bound (Geiger mode)                                |
| `enabled`       | INTEGER 0/1   | toggled by user                                                |
| `sound_type`    | TEXT          | feedback value, e.g. `preset:beep` or `tts:Battery {percent}%` |
| `created_at`    | INTEGER       | ms epoch                                                       |

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

## Message mode

Single-threshold alerts may use native Android text-to-speech by storing the spoken template directly in `sound_type`:

```text
tts:Battery {voltage} volts, {percent}%
```

This is a plain prefix payload, not a URL. Native only treats the first prefix as meaningful:

- `preset:beep` → play bundled preset
- `tts:Battery {value} {unit}` → speak the template

Additional colons inside the message are part of the message.

Message mode is one-shot only. Geiger/range alerts (`threshold_max != null`) use geiger presets and must not use `tts:`. Native should guard against invalid stored combinations.

Templates render from current alert values when the rule fires:

| placeholder   | meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `{value}`     | current primary value for the alert control                    |
| `{threshold}` | configured threshold                                           |
| `{unit}`      | display unit for the alert control                             |
| `{voltage}`   | current battery voltage, battery alerts only                   |
| `{percent}`   | current estimated battery state of charge, battery alerts only |

`{percent}` requires a valid Board battery config. If a placeholder is unavailable, native should avoid speaking raw braces and should record a Diagnostic Event.

Runtime behavior:

- Android native `TextToSpeech` speaks from the foreground service so messages can fire while JS is suspended.
- TTS uses the same alarm-style audio attributes as alert presets.
- TTS is initialized lazily when rules include a `tts:` message and speech plays as soon as possible. Do not pre-generate or cache message audio.
- Message alerts vibrate once, same as one-shot preset alerts.
- If multiple spoken messages compete, the most urgent alert wins and may stop a less urgent spoken message.
- Spoken messages play over active geiger ticks; geiger loops are not paused or ducked.
- Preview supports `tts:` templates with sample placeholder values.
- There is no app-level template length limit beyond what native storage and the platform can handle.

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
