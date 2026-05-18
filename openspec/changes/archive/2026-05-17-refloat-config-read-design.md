# Refloat Config Read Design

## Goal

Add a first backend milestone for the Tune screen that can read and display Refloat tuning values without any possibility of changing board behavior.

This feature is safety-critical. The first implementation must be read-only. It must not send `COMM_SET_CUSTOM_CONFIG`, Refloat runtime tune commands, save commands, restore commands, or any other command that can mutate controller state.

## Scope

In scope:

- Android native read-only API for a Refloat config snapshot.
- Serialized native request flow that cooperates with existing telemetry polling.
- XML schema fetch for version-safe field metadata and binary layout.
- Current custom config fetch.
- Allowlisted decode of the fields shown by the first Tune UI.
- Minimal Tune screen rendering grouped read-only values.
- Tests for protocol framing, XML parsing, binary decoding, queue behavior, and fail-closed cases.

Out of scope:

- Editing values.
- Saving values.
- Runtime tune commands.
- Full arbitrary config editor.
- iOS implementation beyond returning an explicit unsupported error.

## Safety Boundary

Native Android owns all transport and durable session state. JS renders snapshots and request state only.

The read-only API must:

- Require an active connected board session.
- Require a discovered CAN id.
- Use one in-flight config command at a time.
- Temporarily gate normal telemetry polling while a config request is active.
- Resume telemetry polling after success, failure, cancellation, or timeout.
- Fail closed on timeout, unexpected response, unsupported schema, unknown field type, invalid length, or decode mismatch.
- Decode only allowlisted fields.
- Return diagnostics including schema hash, raw config hash, raw config length, board id, CAN id, and capture time.
- Avoid implementing write-capable native methods in this milestone.

## Native API

Expose one JS API from `vesc-ble`:

```ts
export async function getRefloatConfigSnapshot(): Promise<RefloatConfigSnapshot>
```

Type shape:

```ts
export interface RefloatConfigSnapshot {
  capturedAt: number
  boardId: string | null
  canId: number
  schemaHash: string
  rawConfigHash: string
  rawConfigLength: number
  groups: RefloatConfigGroup[]
  missingFieldIds: string[]
}

export interface RefloatConfigGroup {
  id: string
  title: string
  fields: RefloatConfigField[]
}

export interface RefloatConfigField {
  id: string
  label: string
  value: number | boolean | string
  unit: string | null
  min: number | null
  max: number | null
  readOnly: true
}
```

iOS should reject with an explicit `UNSUPPORTED_PLATFORM` error until an iOS transport exists.

## Read Pipeline

1. JS calls `getRefloatConfigSnapshot()`.
2. Native validates that the board phase is connected, GATT is writable, and `canId` exists.
3. Native enters config-request mode and gates telemetry poll sends.
4. Native fetches custom config XML for `confInd = 0` using VESC custom config XML commands forwarded over CAN.
5. Native reconstructs the full XML, computes a schema hash, and parses field id, type, order, label, unit, min, and max.
6. Native fetches current custom config bytes for `confInd = 0`.
7. Native computes the raw config hash and raw length.
8. Native decodes only the allowlisted field ids by XML-derived order and type.
9. Native groups decoded fields for the Tune UI and returns a snapshot.
10. Native exits config-request mode and resumes telemetry polling.

If any step fails, native exits config-request mode, resumes telemetry polling, and rejects the promise with a typed error.

## Field Allowlist

Initial groups should match the Floaty-like base tuning screen from the screenshots:

- General: `kp`, `kp2`, `kp_brake`, `kp2_brake`, `ki`, `ki_limit`, `mahony_kp`, `mahony_kp_roll`.
- ATR: ATR uphill/downhill strength, threshold angle up/down, speed boost, tiltback angle limit, tiltback speed/release speed, tiltback response/transition boost, current filter, amps-to-acceleration ratio, amps-to-deceleration ratio.
- Turn tiltback: strength, tiltback angle limit, aggregate threshold, ERPM threshold, max tiltback speed, speed boost, speed boost max ERPM, aggregate target.
- Torque tiltback: strength, regen strength, start current threshold, tiltback angle limit, max tiltback speed, max tiltback release speed.
- Brake: brake tilt strength, brake tilt lingering.
- Tiltback: constant tiltback, variable tiltback rate, variable tiltback target.

The implementation should map these user-facing fields to exact Refloat XML ids during implementation. Missing ids must be reported in `missingFieldIds` and omitted from display rather than guessed.

## Error Handling

Use typed errors that JS can render directly:

- `BOARD_NOT_CONNECTED`
- `CAN_ID_UNAVAILABLE`
- `GATT_NOT_WRITABLE`
- `CONFIG_REQUEST_IN_FLIGHT`
- `CONFIG_SCHEMA_TIMEOUT`
- `CONFIG_READ_TIMEOUT`
- `UNEXPECTED_CONFIG_RESPONSE`
- `UNSUPPORTED_SCHEMA`
- `CONFIG_DECODE_FAILED`
- `UNSUPPORTED_PLATFORM`

All errors must leave telemetry polling in its prior state.

## UI Behavior

The Tune screen should show a read-only config view:

- Loading state while snapshot is fetched.
- Error state with retry.
- Grouped values after success.
- No editable inputs.
- No save button.
- Missing fields can be hidden, with a compact diagnostics row showing missing count if needed.

The UI should not cache values as truth. It should display the latest native snapshot and allow manual refresh.

## Testing

Add focused tests:

- Protocol tests for custom config XML request framing.
- Protocol tests for custom config read request framing.
- Parser tests using a Refloat XML fixture.
- Binary decoder tests using a fixture whose values are known.
- Queue tests proving config read gates telemetry poll sends and always resumes.
- Failure tests for timeout, unexpected response, missing field, unknown type, and truncated binary config.

Use `bun` for JS tests and `bun run test:android` for Android unit tests.

## Implementation Notes

Prefer small native units:

- Protocol builders/parsers in `VescProtocol.kt` or a nearby focused file.
- XML schema parser as a pure Kotlin unit.
- Binary config decoder as a pure Kotlin unit.
- Foreground service integration limited to command queue, session validation, and promise resolution.

No write-capable methods should be added until a separate design explicitly covers editing, validation, backup, verification, and rider-facing safety controls.
