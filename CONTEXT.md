# VESC App PoC Context

This context defines the shared language for the VESC-based board app. The app centers on live board state, ride recording, ride history, and safety-sensitive Refloat tuning.

## Language

**Board**:
A saved rideable device that can be connected over BLE and may expose one motor controller through CAN.
_Avoid_: Device, controller, scooter

**Board Link**:
The saved, probe-confirmed reachability details for a Board, including BLE peripheral id, Board Transport, and optional auxiliary CAN targets such as BMS.
_Avoid_: Pairing, connection settings, device config

**Board Session**:
The lifecycle of a single live BLE-bound connection to a Board, from connect attempt through disconnect. Owns the in-flight identity used to discard stale callbacks across reconnects. Distinct from Ride Recording, which is the persisted ride capture.
_Avoid_: Session, connection, BLE session

**Board Transport**:
The resolved path used to reach a Board's telemetry: Direct (the BLE-connected controller is the data source) or CAN-forwarded to a specific CAN id. A durable per-Board fact, not per-session. Absence means the transport has not been detected yet.
_Avoid_: Connection path, routing, channel

**Board Probe**:
A pre-save check that a scanned BLE peripheral can produce telemetry over at least one Board Transport and produce a Board Link. The rider-facing UI calls running a Board Probe "linking" (and re-running it "re-linking") — the screen, buttons, and progress timeline say "link", while the domain and code keep "Board Probe" for the act and "Board Link" for the saved result.
_Avoid_: Validation, test connection, scan

**Live State**:
The current app-visible snapshot of board connection, GPS, scan, recording, and recent telemetry state.
_Avoid_: UI state, cached status

**Telemetry Sample**:
A single decoded board data point captured from the connected board.
_Avoid_: Packet, frame, event

**Metric Sanitizer**:
A rule that marks an implausible telemetry-derived value as excluded from ride metrics without changing the original sample.
_Avoid_: Filter, smoother, cleaner

**Metric Exclusion**:
A durable annotation that explains why a metric value from a Telemetry Sample was left out of one or more ride metrics.
_Avoid_: Deleted value, hidden sample, rejected packet

**Battery SoC Estimate**:
The processed battery charge percentage — IR-compensated then median-windowed over a configurable interval — that the app displays and evaluates battery **Alert Rules** against, while raw pack voltage stays the **Telemetry Sample**.
_Avoid_: Battery level, voltage percent, smoothed battery (in raw-telemetry contexts)

**GPS Fix**:
A single phone location sample used for live map position or ride recording.
_Avoid_: Location event, GPS point

**Ride Recording**:
A persisted ride capture made from board telemetry samples, optionally enriched with precise GPS fixes captured at the same time as telemetry.
_Avoid_: Session recording, raw recording

**Privacy Zone**:
A user-defined geographic area where Ride Recording data is not retained.
_Avoid_: Save area, safe area, hidden zone

**Ride History**:
The persisted list of past ride recordings and their derived samples, routes, markers, and summaries.
_Avoid_: Playback, logs

**Ride History Marker**:
A map-visible point in Ride History that explains a ride boundary, connection loss, interruption, or notable recording condition.
_Avoid_: Telemetry marker, debug marker, log point

**Moving Window**:
The span of a Ride Recording from its first to its last moving Telemetry Sample — the part the rider treats as actual riding. A Telemetry Sample counts as moving when it is not excluded from speed metrics (so low-speed and free-spin samples do not count). Leading and trailing non-moving spans fall outside the Moving Window; internal stops (photos, cooldown) stay inside it. Drives history-timeline trimming and the moving ride time shown in stats. A Ride Recording with no moving samples has no Moving Window and is not shown in Ride History; legacy recordings with an unknown Moving Window fall back to their full wall-clock span.
_Avoid_: Trim range, active range, ride duration

**Media History Asset**:
A phone photo or video whose capture time falls inside a selected Ride Recording and which can be placed using a nearby recording-backed GPS fix. The asset remains owned by the OS photo library and is never copied into Ride History.
_Avoid_: Ride photo, recording media, uploaded media

**Map Point**:
A user-authored map-visible location that is independent from Ride Recording and Ride History. A Map Point may describe a direction target, trail feature, viewpoint, charging place, or similar location.
_Avoid_: Marker, GPS point, telemetry marker

**Map Camera Controller**:
The app-owned volatile coordinator for map camera position, zoom, pitch, heading, padding, animation, and transitions between live follow, manual browse, and ride history framing.
_Avoid_: Map manager, map state manager, camera helper

**Map Camera Intent**:
A user or app request for the Map Camera Controller to choose the next camera state, such as following live GPS, browsing manually, or framing ride history.
_Avoid_: Camera command, map action, imperative camera call

**History Camera Refinement**:
The Map Camera Controller's in-flight adjustment from approximate Ride History framing to exact route framing for the same selected ride.
_Avoid_: Second jump, route correction, recenter after load

**Map Camera Profile**:
A named camera behavior used by the Map Camera Controller to derive heading, zoom, pitch, padding, and animation policy for a view or navigation mode.
_Avoid_: Tilt setting, view camera hack, mode special case

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

**Alert Message Template**:
A user-authored spoken phrase on a one-shot Alert Rule that may include current alert-value placeholders and is spoken by native text-to-speech when the rule fires.
_Avoid_: TTS sound, voice preset, notification text

**App Setting**:
A user-controlled app preference that affects app behavior across boards unless explicitly scoped elsewhere.
_Avoid_: Option, config

**Diagnostic Event**:
An app-observed abnormal condition that helps explain board connection, telemetry, tuning, recording, or UI failures.
_Avoid_: Error log, debug session, crash report

## Relationships

- A **Board** has at most one **Board Link**; absence means the Board is offline-only or not yet linked.
- A **Board Link** has exactly one **Board Transport**.
- A **Board Link** is only saved after a successful **Board Probe**.
- A **Board Session** uses the stored **Board Link** and is not established for a Board without one.
- A **Board Probe** can resolve a **Board Transport** before a **Board** is created.
- A **Board Session** owns one live BLE connection to a **Board**; only Telemetry Samples received during the active session count toward live state and Ride Recording.
- A **Board** produces **Telemetry Samples** while connected.
- A **Metric Sanitizer** may create **Metric Exclusions** for values derived from **Telemetry Samples** while preserving the original samples and current live board readout.
- A **Metric Exclusion** belongs to one **Telemetry Sample** and one metric.
- A **GPS Fix** may be associated with live map state, but only GPS fixes captured alongside **Telemetry Samples** contribute to a **Ride Recording**.
- A **Map Point** is placed by the user on the live map and does not belong to **Ride Recording** or **Ride History**.
- A **Map Camera Controller** may frame **Live State**, **Ride History**, **GPS Fixes**, or **Map Points**, but does not own those domain objects.
- A **Map Camera Intent** is interpreted by the **Map Camera Controller**; outside components request camera behavior instead of mutating the map camera directly.
- A **History Camera Refinement** belongs to one selected **Ride Recording** in **Ride History** and is ignored if the selected ride changes or the rider manually browses the map.
- A **Map Camera Profile** belongs to the **Map Camera Controller** and keeps pitch zoom-derived, including removing map tilt at far zoom levels.
- A **Map Camera Profile** for compass follow preserves live follow during zoom-only gestures near the followed GPS fix, matching GPS-heading follow behavior.
- A **Map Camera Profile** for compass follow is applied only after a real compass heading is available; heading zero is not used as a placeholder for compass readiness.
- A style reload is treated as a **Map Camera Intent** that preserves the current manual camera snapshot or recomputes the active logical target without resetting heading or pitch.
- A weather view uses a **Map Camera Profile** rather than a direct zoom change; it keeps the current map center while applying a weather overview zoom and low or flat pitch.
- A **Map Camera Controller** uses **App Settings** such as map style, navigation mode, and perspective mode, but those settings remain durable preferences outside the controller.
- A **Privacy Zone** limits what **Ride Recording** data is retained without changing **Live State**.
- A **Ride Recording** becomes part of **Ride History**.
- A **Moving Window** belongs to one **Ride Recording** and is derived from which **Telemetry Samples** are excluded from speed metrics; a Ride Recording without one is excluded from **Ride History**.
- A **Ride History Marker** belongs to **Ride History** and may explain where a **Ride Recording** lost or regained board data.
- A **Media History Asset** is a local-only view of an OS photo-library asset matched to one selected **Ride Recording** by capture time and placed from a nearby recording-backed **GPS Fix**.
- A **Tune Snapshot** belongs to the currently connected **Board** and is read-only.
- A **Tune Profile** belongs to a **Board** and stores semantic field values independently of firmware schema.
- A **Tune History Entry** captures the previous state of a **Tune Profile** before each explicit save.
- An **Alert Rule** evaluates against live **Telemetry Samples**.
- An **Alert Message Template** belongs to one **Alert Rule**.
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
- "scan" may mean BLE discovery or telemetry validation; resolved term: use **Board Probe** for the pre-save telemetry check after selecting a BLE peripheral. UI copy says "linking" for this; code/domain keep "Board Probe".
- "paired" may mean a selected BLE peripheral or a Board that is ready to connect; resolved term: use **Board Link** for the saved, probed reachability details.
- `bleId` without a **Board Transport** is an invalid partial **Board Link**; resolved: save the whole **Board Link** or none of it.
- "session" may mean a BLE connection, raw debug capture, or persisted ride; resolved terms: use **Board Session** for the live BLE connection lifecycle and **Ride Recording** for the persisted ride capture. Avoid bare "session".
- "error" may mean crash, handled failure, UI message, or diagnostic clue; resolved term: use **Diagnostic Event** for app-observed abnormal conditions worth reviewing.
- "telemetry marker" names the storage table, but map-visible history annotations are **Ride History Markers**.
- "point" may mean a GPS coordinate, route coordinate, history annotation, or user-authored map location; resolved term: use **Map Point** for user-authored map locations.
- "map manager" may mean camera orchestration, map style selection, layer visibility, or map data ownership; resolved term: use **Map Camera Controller** for camera orchestration only.
- "camera command" and direct method-style names obscure who chooses the final camera; resolved term: use **Map Camera Intent** for requests handled by the **Map Camera Controller**.
- "route correction" sounds like changing Ride History data; resolved term: use **History Camera Refinement** for camera-only retargeting from approximate to exact ride framing.
- "tilt setting" is too narrow because pitch depends on zoom, heading, padding, and view intent; resolved term: use **Map Camera Profile**.
- "filter" may mean dropping samples, smoothing charts, or excluding implausible values from metrics; resolved term: use **Metric Sanitizer** for metric exclusion that preserves original samples.
- "save area" or "safe area" may mean a privacy boundary around home or work; resolved term: use **Privacy Zone**.
- "smoother" is avoided in the raw-telemetry layer (see **Metric Sanitizer**) but is legitimate for the **Battery SoC Estimate**, a processed derived value that smooths the percentage only — never the raw voltage **Telemetry Sample**.
