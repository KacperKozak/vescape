# Tune Screen Reference

This document captures practical tune-screen behavior used by a Refloat-focused
board app. It is intended as product and implementation reference for building a
safe tuning UI in this app.

The important design pattern is a two-layer tuning model:

- Basic mode exposes a small set of rider-facing sliders.
- Detailed or advanced mode exposes the underlying Refloat fields directly.

Basic sliders are not merely labels for single config values. Some sliders write
multiple low-level fields, and some use a different rider-facing name from the
underlying firmware concept.

## Basic Slider Model

All formulas below use `x` as the rider-facing slider value.

Linear interpolation means:

```text
interpolate(x, [inputMin, inputMax], [outputMin, outputMax])
```

Display values are rounded after conversion to the underlying field value.

| Slider | UI range | Step | Underlying behavior |
| --- | ---: | ---: | --- |
| Aggressiveness | `-5..10` | `1` | Writes PID and Mahony filter values together. |
| Nose stiffness | `0..10` | `1` | Writes acceleration torque tiltback strength. |
| Tail stiffness | `0..10` | `1` | Writes regen/braking torque tiltback strength. |
| Carve tilt | `0..15` | `1` | Writes turn tiltback strength directly. |
| Brake tilt | `0..5` | `1` | Writes brake tiltback strength directly. |
| ATR intensity | `0..15` | `1` | Writes uphill and downhill ATR strength together. |

## Basic Slider Formulas

### Aggressiveness

The aggressiveness slider is a compound ride-feel control. It writes five
underlying fields:

| Field | Formula |
| --- | --- |
| `kp` | `round(interpolate(x, [-5, 10], [15, 30]), 0)` |
| `kp2` | `round(interpolate(x, [-5, 10], [0.4, 1.1]), 1)` |
| `ki` | `round(interpolate(x, [-5, 10], [0.015, 0.03]), 3)` |
| `mahony_kp` | `round(interpolate(x, [-5, 10], [2.2, 1.5]), 1)` |
| `mahony_kp_roll` | `round(interpolate(x, [-5, 10], [2.2, 1.5]), 1)` |

The displayed slider value is derived from `kp - 20`, clamped to `[-5, 10]`.
That means `kp = 20` displays as neutral `0`, lower `kp` displays negative, and
higher `kp` displays positive.

Behaviorally:

- Higher `kp` increases angle proportional response.
- Higher `kp2` increases rate response and damping of quick nose-angle changes.
- Higher `ki` increases integral correction.
- Lower `mahony_kp` and `mahony_kp_roll` make the board feel snappier/stiffer;
  higher values make it feel looser and more lingering.

Because `mahony_kp` moves down while `kp`, `kp2`, and `ki` move up, this slider
is not just "more PID". It coordinates PID and IMU filter feel.

### Nose Stiffness

Nose stiffness writes acceleration torque tiltback:

```text
torquetilt_strength = round(x * 0.03, 2)
```

The displayed slider value is derived from:

```text
torquetilt_strength / 0.03
```

At the UI range endpoints:

| Slider | `torquetilt_strength` |
| ---: | ---: |
| `0` | `0.00 deg/A` |
| `5` | `0.15 deg/A` |
| `10` | `0.30 deg/A` |

Behaviorally, this applies nose lift based on positive output current. It can
increase acceleration and uphill aggressiveness even when ATR is absent or weak.

### Tail Stiffness

Tail stiffness writes regen torque tiltback:

```text
torquetilt_strength_regen = round(x * 0.03, 2)
```

The displayed slider value is derived from:

```text
torquetilt_strength_regen / 0.03
```

At the UI range endpoints:

| Slider | `torquetilt_strength_regen` |
| ---: | ---: |
| `0` | `0.00 deg/A` |
| `5` | `0.15 deg/A` |
| `10` | `0.30 deg/A` |

Behaviorally, this applies nose lowering based on negative output current
regen. It can increase braking and downhill aggressiveness even when ATR is
absent or weak.

### ATR Intensity

ATR intensity writes both uphill and downhill ATR strengths to the same value:

```text
atr_strength_up = round(interpolate(x, [0, 15], [0, 2]), 1)
atr_strength_down = round(interpolate(x, [0, 15], [0, 2]), 1)
```

The displayed slider value is derived from the stronger of the two ATR fields:

```text
interpolate(max(atr_strength_up, atr_strength_down), [0, 2], [0, 15])
```

At useful points:

| Slider | `atr_strength_up` | `atr_strength_down` |
| ---: | ---: | ---: |
| `0` | `0.0` | `0.0` |
| `7.5` | `1.0` | `1.0` |
| `15` | `2.0` | `2.0` |

Behaviorally, ATR applies nose lift or lowering based on adaptive torque
response rather than raw current alone. It is meant to respond to the difference
between expected acceleration and measured acceleration, which makes uphill and
downhill response more rider-weight-aware than pure torque tiltback.

Field naming note: the underlying Refloat names are commonly
`atr_strength_up` and `atr_strength_down`. Our current local model labels these
as `atr_uphill_strength` and `atr_downhill_strength`; they should map to the
same user-facing concepts.

### Carve Tilt

Carve tilt writes turn tiltback strength directly:

```text
turntilt_strength = x
```

The slider range is `0..15`. This is a direct one-to-one basic control over the
turn tiltback strength field.

### Brake Tilt

Brake tilt writes brake tiltback strength directly:

```text
braketilt_strength = x
```

The slider range is `0..5`. This is a direct one-to-one basic control over the
brake tiltback strength field.

## Detailed Field Groups

A useful detailed tune screen groups fields by behavior rather than raw schema
order.

### General

| Field | Label | Notes |
| --- | --- | --- |
| `kp` | Angle P | Main proportional angle response. Higher values make the board respond more strongly to nose angle error. |
| `kp2` | Rate P | Responds to angular velocity. Acts like a damping/derivative component and is especially noticeable in fast or aggressive maneuvers. |
| `kp_brake` | Angle P (Braking) | Multiplier for angle response while braking. |
| `kp2_brake` | Rate P (Braking) | Multiplier for rate response while braking. |
| `ki` | Angle I | Integral correction. |
| `ki_limit` | I Term Limit | Limits integral term authority. |
| `mahony_kp` | Pitch KP | Pitch-axis Mahony filter accelerometer correction. Higher values feel looser and linger more; lower values feel snappier. |
| `mahony_kp_roll` | Roll KP | Roll-axis Mahony filter correction. Lower than pitch can help the nose hold up in turns and make tight carves feel stiffer. |

Rate P and Angle P should be treated as related ride-feel values. If Angle P is
changed substantially, Rate P usually needs to move in a similar proportion to
preserve feel.

### ATR

| Field | Label | Notes |
| --- | --- | --- |
| `atr_strength_up` | ATR Uphill Strength | Nose lift applied from ATR response. |
| `atr_strength_down` | ATR Downhill Strength | Nose lowering applied from ATR response. |
| `atr_threshold_up` | Threshold Angle Up | Angle threshold for uphill ATR behavior. |
| `atr_threshold_down` | Threshold Angle Down | Angle threshold for downhill ATR behavior. |
| `atr_speed_boost` | Speed Boost | Boosts ATR response with speed. |
| `atr_angle_limit` | Tiltback Angle Limit | Maximum ATR tiltback angle. |
| `atr_on_speed` | Max Tiltback Speed | Maximum speed for applying ATR tiltback. |
| `atr_off_speed` | Max Tiltback Release Speed | Maximum speed for releasing ATR tiltback. |
| `atr_response_boost` | Tiltback Response Boost | Boost factor for tiltback response. |
| `atr_transition_boost` | Tiltback Transition Boost | Boost factor around response transitions. |
| `atr_filter` | Current Filter | Current filter frequency. |
| `atr_amps_accel_ratio` | Amps to Acceleration Ratio | Ratio used for acceleration-side ATR behavior. |
| `atr_amps_decel_ratio` | Amps to Deceleration Ratio | Ratio used for deceleration-side ATR behavior. |

Common recommended strength range is around `1.0..2.5`, with `2.5` already
being aggressive. Older ATR strength values may appear 10x smaller in older
firmware discussions.

### Torque Tiltback

| Field | Label | Notes |
| --- | --- | --- |
| `torquetilt_strength` | Strength | Nose lift based on positive output current. Basic "Nose stiffness" writes this. |
| `torquetilt_strength_regen` | Strength (Regen) | Nose lowering based on negative regen current. Basic "Tail stiffness" writes this. |
| `torquetilt_start_current` | Start Current Threshold | Current threshold before torque tiltback starts. |
| `torquetilt_angle_limit` | Tiltback Angle Limit | Maximum torque tiltback angle. |
| `torquetilt_on_speed` | Max Tiltback Speed | Maximum speed for applying torque tiltback. |
| `torquetilt_off_speed` | Max Tiltback Release Speed | Maximum speed for releasing torque tiltback. |

Typical strength range for basic controls is `0.00..0.30 deg/A`; broader
advanced editors may allow up to `1.00 deg/A`.

### Turn Tiltback

| Field | Label | Notes |
| --- | --- | --- |
| `turntilt_strength` | Strength | Basic "Carve tilt" writes this directly. |
| `turntilt_angle_limit` | Tiltback Angle Limit | Maximum turn tiltback angle. |
| `turntilt_start_angle` | Turn Aggregate Threshold | Turn aggregate threshold before response starts. |
| `turntilt_start_erpm` | ERPM Threshold | Speed threshold before response starts. |
| `turntilt_speed` | Max Tiltback Speed | Maximum speed for applying turn tiltback. |
| `turntilt_erpm_boost` | Speed Boost % | Boost percentage based on ERPM. |
| `turntilt_erpm_boost_end` | Speed Boost Max ERPM | ERPM where boost reaches its maximum. |
| `turntilt_yaw_aggregate` | Turn Aggregate Target | Target accumulated yaw/turn value. |

### Brake Tilt

| Field | Label | Notes |
| --- | --- | --- |
| `braketilt_strength` | Brake Tilt Strength | Basic "Brake tilt" writes this directly. |
| `braketilt_lingering` | Brake Tilt Lingering | Controls how brake tilt lingers/releases. |

### Tiltback

| Field | Label | Notes |
| --- | --- | --- |
| `tiltback_constant` | Constant Tiltback | Constant nose angle offset. |
| `tiltback_variable` | Variable Tiltback Rate | Variable tiltback amount per ERPM. |
| `tiltback_variable_max` | Variable Tiltback Target | Maximum variable tiltback target. |

## UI Behavior Notes

### Retrieval and Persistence Model

There are two related but different tuning paths:

- Custom config read/write: full persisted controller package configuration.
- Runtime tune commands: smaller Refloat package commands for live tune actions.

The safe default for this app is to build the tune screen on custom config
readback first, then add writes only after the persistence path is fully tested.

### Custom Config Read Flow

The board exposes custom config metadata and bytes through VESC custom config
commands. On a CAN-forwarded controller, each command is wrapped as:

```text
[COMM_FORWARD_CAN, canId, command, ...args]
```

Relevant custom config commands:

| Command | ID | Purpose |
| --- | ---: | --- |
| `COMM_GET_CUSTOM_CONFIG_XML` | `92` | Read the XML/schema for a custom config index. |
| `COMM_GET_CUSTOM_CONFIG` | `93` | Read the current binary config bytes for a custom config index. |
| `COMM_GET_CUSTOM_CONFIG_DEFAULT` | `94` | Read default binary config bytes. |
| `COMM_SET_CUSTOM_CONFIG` | `95` | Write binary config bytes back to the controller. |

Observed read sequence:

1. Discover or already know the motor controller CAN id.
2. Fetch XML/schema chunks with `COMM_GET_CUSTOM_CONFIG_XML`.
3. Reassemble the XML bytes until the returned total length is complete.
4. Parse the XML into ordered fields, value types, scale factors, labels, units,
   and min/max metadata.
5. Fetch current config bytes with `COMM_GET_CUSTOM_CONFIG`.
6. Decode only allowlisted tune fields using XML-derived offsets and types.
7. Return a snapshot containing decoded groups, missing field IDs, schema hash,
   raw config hash, config byte length, CAN id, board id, capture time, and
   firmware string if available.

The XML request carries:

```text
[92, confIndex, requestedLength:uint32, offset:uint32]
```

The XML response carries:

```text
[92, confIndex, totalLength:uint32, offset:uint32, chunk...]
```

The config bytes request carries:

```text
[93, confIndex]
```

The config bytes response carries:

```text
[93, confIndex, configBytes...]
```

For Refloat package config, `confIndex` is `0`.

### Custom Config Write Flow

Persistent config writes should be treated as full-config writes, not individual
field writes.

The write command payload shape is:

```text
[95, confIndex, packageSignature:uint32, encodedConfigBytes...]
```

For a safe write flow:

1. Read the current XML/schema.
2. Read the current binary config bytes.
3. Decode the fields into a local draft.
4. Apply UI changes to the draft.
5. Re-encode the full config using the same schema/signature.
6. Send `COMM_SET_CUSTOM_CONFIG`.
7. Confirm success or failure before updating UI state.
8. Re-read the config after saving when possible.

The full-config rewrite matters because the controller stores a binary struct,
not independent key/value pairs. Unknown fields must be preserved exactly. A
write implementation should never create a config from only the visible tune
fields.

### Runtime Tune Commands

Refloat also exposes package-specific tune commands over
`COMM_CUSTOM_APP_DATA` (`36`) using the Refloat package id (`101`). These are
separate from full custom config persistence.

Relevant package command IDs:

| Command | ID | Purpose |
| --- | ---: | --- |
| `GET_INFO` | `33` | Read package/device info. |
| `GET_RTDATA` | `34` | Read runtime data. |
| `SET_TUNE` | `35` | Apply tune values at runtime. |
| `SET_DEFAULT_TUNE` | `36` | Apply/reset default tune values. |
| `SAVE_TUNE` | `37` | Persist current tune state. |
| `RESTORE_TUNE` | `38` | Restore saved tune state. |
| `TUNE_OTHER` | `39` | Apply miscellaneous tune values. |

This implies two possible edit strategies:

- Full config strategy: edit a local full config draft and persist through
  `COMM_SET_CUSTOM_CONFIG`.
- Runtime strategy: send Refloat tune commands for immediate behavior changes,
  then explicitly call `SAVE_TUNE` if the change should survive restart.

Do not mix these paths casually. A runtime tune command may affect live behavior
before a full config save, while a full custom config write may replace values
that were changed through runtime tune commands. The UI should present clear
draft/apply/save semantics if both paths are ever supported.

### Version Compatibility

The robust compatibility model is schema-driven, not version-string-driven:

- Read the board's custom config XML/schema before decoding raw config bytes.
- Use the schema serialization order for binary offsets.
- Use schema-provided field type, scale, label, unit, min, and max.
- Decode only known/allowlisted fields.
- If an allowlisted field is absent, omit it and report it as missing instead
  of guessing an offset.
- If the schema shape or field type is unsupported, fail closed instead of
  writing or displaying potentially wrong values.

The firmware version string is still useful diagnostics, but it should not be
the primary decoder. A board can expose a different schema on the same nominal
firmware family, and the XML schema is the source of truth for field order and
encoding.

Known version-sensitive field semantics:

| Area | Affected fields | Compatibility note |
| --- | --- | --- |
| High/low voltage pushback | `tiltback_hv`, `tiltback_lv` | Refloat 1.2 with VESC firmware `6.05+` supports per-cell voltage values. Older `6.02` setups use total pack voltage, e.g. `4.3V * cell_count` for high voltage and `3.0V * cell_count` for low voltage. |
| I term limit | `ki_limit` | Older firmware exposed this concept as `Deadzone`; the modern value is scaled up 10x. A previous `Deadzone = 3` corresponds to `ki_limit = 30A`. |
| ATR strength | `atr_strength_up`, `atr_strength_down` | Older `5.3 ATR` values are scaled 10x smaller. A previous ATR strength of `0.10` corresponds to modern `1.0`. |
| BMS temperature alert | BMS temperature threshold fields | Some BMS-related options require VESC firmware `6.06+` and sufficiently recent BMS firmware. |
| Parking brake | `parking_brake_mode` | Firmware `6.05+` applies parking brake by shorting motor phases; older behavior may differ. |
| Audible feedback | haptic/audible feedback fields | Some generated tones rely on `foc_play_tone` behavior from firmware `6.05`; other modes use current modulation instead. |

For our app, this means write support should be gated by schema validation and
field presence, not just a displayed firmware version. If a value has changed
meaning across versions, the UI should show version-aware helper text and avoid
silently converting unless the cell count or old/new semantic can be proven.

### Basic and Advanced Values Must Stay in Sync

When detailed values change, the basic sliders should recompute their displayed
positions from the underlying fields:

- Aggressiveness displays from `kp - 20`.
- Nose stiffness displays from `torquetilt_strength / 0.03`.
- Tail stiffness displays from `torquetilt_strength_regen / 0.03`.
- ATR intensity displays from `max(atr_strength_up, atr_strength_down)` mapped
  from `[0, 2]` back to `[0, 15]`.
- Carve tilt displays from `turntilt_strength`.
- Brake tilt displays from `braketilt_strength`.

This means asymmetrical detailed ATR edits cannot be represented perfectly by
the one-dimensional ATR intensity slider. The basic slider intentionally shows
the stronger of uphill and downhill strength.

### Basic Edits Can Overwrite Detailed Asymmetry

Some basic sliders write multiple fields:

- Aggressiveness overwrites five fields.
- ATR intensity overwrites both uphill and downhill ATR strength.

If a rider customized those fields independently in detailed mode, moving the
basic slider collapses that custom shape back onto the basic formula. The UI
should make this interaction predictable by treating basic sliders as presets or
compound controls, not as harmless aliases.

### Save Semantics

Changing slider state should be treated separately from persisting to the board.
A safe UX has three distinct phases:

- Read current config from the controller.
- Apply edits to a local draft.
- Explicitly write and save the final draft.

The current app should keep read-only tune inspection separate from future write
paths until mutation commands, save behavior, and failure recovery are designed
and tested.

## Implementation Notes for This Repo

Current local read-only field groups live in:

```text
modules/vesc-ble/android/src/main/java/expo/modules/vescble/RefloatConfigModels.kt
```

Before implementing writes, align field IDs with the schema names returned by
the board. In particular, confirm whether the schema exposes ATR fields as:

- `atr_strength_up` / `atr_strength_down`
- or `atr_uphill_strength` / `atr_downhill_strength`

The UI can use rider-facing labels either way, but write paths must use exact
schema field IDs.
