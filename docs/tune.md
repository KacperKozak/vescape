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

