# Pure-logic modules in native services

`VescForegroundService` had grown to ~2200 LOC, mixing Android lifecycle, BLE protocol state machines, telemetry pipelines, alert evaluation, reconnect policy, notification formatting, and diagnostics. We are extracting the platform-agnostic logic into standalone Kotlin modules with no Android imports, so the Service becomes a thin coordinator that owns lifecycle and wires collaborators.

Modules follow a **pragmatic-pure** stance: idiomatic Kotlin classes with their own state, no Android dependencies, side effects only through injected ports (`Scheduler`, `BleSender`, `EventEmitter`). The Refloat config read/write controller is the one **strict** exception — modelled as `fn(state, event) -> (state', List<Effect>)` because its many transitions collapse better as a pure FSM with effect interpretation than as a stateful class.

A lightweight **Board Session** identity object (see `CONTEXT.md`) replaces the ad-hoc `generation` counter used today to discard stale callbacks across reconnects.

## Considered Options

- **Leave as one Service class.** Rejected: readability and per-feature test setup overhead are now real friction.
- **Strict FSM everywhere (Elm/Redux-lite).** Rejected as too much ceremony for modules where a normal class with internal state is clearer. Kept strict only where transition density justifies it (`ConfigRWFsm`).
- **Kotlin Multiplatform to share with iOS.** Rejected (KISS). KMP build complexity outweighs current iOS-port benefit; pure-Kotlin modules still document a portable shape if iOS is taken on later.
- **One big refactor PR.** Rejected as a review hazard. Land in 3-4 medium PRs, foundation-first.

## Consequences

- Extracted modules have **no Android imports**. Tests run on plain JVM, no Robolectric.
- Time and scheduling go through a `Scheduler` interface backed by `mainHandler` in production and a controllable fake in tests. Strict-FSM modules return `Effect.ScheduleTimeout(...)` from transitions; the Service interprets effects.
- Shared state is **owned by the module that mutates it** (`TelemetryPipeline` owns history buffers; `ReconnectScheduler` owns retry counters; etc.). The Service holds only cross-cutting fields it actually mutates (`boardConfig`, `boardStatus`, `boardError`, current `BoardSession`, `pendingConnect*`).
- `Board Session` is the canonical name for the live BLE-bound connection lifecycle. Modules capture a `BoardSession` reference and check `isActive` before mutating, replacing the bare `generation: Long` pattern.
- First-pass extraction list: `Scheduler`, `BoardSession`, `NotificationPresenter`, `DiagnosticsRecorder`, `ConfigRWFsm` (strict), `TelemetryPipeline`, `ReconnectScheduler`. Deferred (re-evaluate when a concrete need lands): `BatteryConfigProvider`, `AlertCoordinator`, `GpsTracker`.
- Per-packet allocation budget is unchanged: pipeline owns long-lived buffers, hot path stays at current ~10-50 Hz cost.
