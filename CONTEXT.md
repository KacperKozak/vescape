# VESC App PoC Context

This context defines the shared language for the VESC-based board app. The app centers on live board state, ride recording, ride history, and safety-sensitive Refloat tuning.

## Language

**Board**:
A saved rideable device that can be connected over BLE and may expose one motor controller through CAN.
_Avoid_: Device, controller, scooter

**Live State**:
The current app-visible snapshot of board connection, GPS, scan, recording, and recent telemetry state.
_Avoid_: UI state, cached status

**Telemetry Sample**:
A single decoded board data point captured from the connected board.
_Avoid_: Packet, frame, event

**GPS Fix**:
A single phone location sample used for live map position or ride recording.
_Avoid_: Location event, GPS point

**Ride Recording**:
A persisted ride capture made from board telemetry samples, optionally enriched with precise GPS fixes captured at the same time as telemetry.
_Avoid_: Session recording, raw recording

**Ride History**:
The persisted list of past ride recordings and their derived samples, routes, markers, and summaries.
_Avoid_: Playback, logs

**Tune Snapshot**:
A read-only view of the board's current Refloat tuning configuration decoded from the board's schema and binary config.
_Avoid_: Tune cache, settings dump

**Tune Profile**:
A user-authored, persisted set of all Refloat tune field values stored in semantic (human-meaningful) units, scoped to a Board.
_Avoid_: Tune preset, config file, settings backup

**Tune History Entry**:
An immutable snapshot of a Tune Profile's field values captured immediately before an explicit save, enabling rollback to any prior state.
_Avoid_: Sync log, change event, audit trail

**Alert Rule**:
A user-defined telemetry threshold that can trigger board-riding feedback during a live connection. A rule with only a threshold fires a one-shot alert; a rule with both threshold and thresholdMax fires a geiger-style progressive alert that accelerates with range depth.
_Avoid_: Alarm, notification

**Alert Preset**:
A bundled audio asset used for alert feedback, belonging to exactly one category: single (one-threshold alerts) or geiger (range alerts with progressive ticking).
_Avoid_: Sound effect, ringtone, tone

**App Setting**:
A user-controlled app preference that affects app behavior across boards unless explicitly scoped elsewhere.
_Avoid_: Option, config

**Diagnostic Event**:
An app-observed abnormal condition that helps explain board connection, telemetry, tuning, recording, or UI failures.
_Avoid_: Error log, debug session, crash report

## Relationships

- A **Board** produces **Telemetry Samples** while connected.
- A **GPS Fix** may be associated with live map state, but only GPS fixes captured alongside **Telemetry Samples** contribute to a **Ride Recording**.
- A **Ride Recording** becomes part of **Ride History**.
- A **Tune Snapshot** belongs to the currently connected **Board** and is read-only.
- A **Tune Profile** belongs to a **Board** and stores semantic field values independently of firmware schema.
- A **Tune History Entry** captures the previous state of a **Tune Profile** before each explicit save.
- An **Alert Rule** evaluates against live **Telemetry Samples**.
- An **App Setting** affects app behavior and is not part of a **Tune Profile** or **Board** identity.
- A **Diagnostic Event** may describe failures around a **Board**, **Live State**, **Telemetry Sample**, **Ride Recording**, or **Tune Profile** workflow.

## Example Dialogue

> **Dev:** "If GPS is active but no board is connected, should that create a Ride Recording?"
> **Domain expert:** "No. Standalone GPS can update the live map, but a Ride Recording requires board telemetry from a connected Board."

> **Dev:** "If the board's tune changed outside the app, what happens when the user connects?"
> **Domain expert:** "The app reads a Tune Snapshot and compares it against the Tune Profile. Changed fields show old and new values with per-field revert. User decides: accept board values into the profile, or push the profile to the board."

> **Dev:** "Can I edit a Tune Profile without a connected board?"
> **Domain expert:** "Yes. Editing and saving is local. Pushing to a board requires a live connection — the app must read the full config blob first to preserve unknown fields."

## Flagged Ambiguities

- "device" may mean the phone BLE peripheral, the saved app board, or the motor controller; resolved term: use **Board** for the saved rideable device.
- "session" may mean a BLE connection, raw debug capture, or persisted ride; resolved term: use **Ride Recording** for persisted ride capture and avoid using "session" without a qualifier.
- "error" may mean crash, handled failure, UI message, or diagnostic clue; resolved term: use **Diagnostic Event** for app-observed abnormal conditions worth reviewing.
