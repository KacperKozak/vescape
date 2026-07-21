# Debug Recording replay drives the real session stack through the transport seam

We need to test Board Warning detectors (and eventually most of the live-session stack) against real
board data without a board present: committed clean recordings guard against false positives, and a
dev-mode UI replay reproduces field behavior almost end-to-end. A Debug Recording already captures
every raw BLE `rx` chunk with relative timestamps, so everything the session stack ever sees is
replayable.

## Decision

Replay injects recorded chunks at the **transport seam** (`VescGattListener` / iOS peer): a
`ReplayTransport` fakes the connect/ready callbacks, emits recorded `rx` chunks at their recorded
`t` (1× real time), and swallows writes. Everything above the seam — packet reassembly, telemetry
pipeline, BMS pipe, warning detectors, recording, live state, JS UI — runs unmodified and cannot
tell replay from a live board.

Two consumers share the chunk-decode core:

- **Unit replay harness** (test source, both platforms, `@parity` pair): fixture `.jsonl` →
  reassembler → `parseBmsValues` → detector under test, with recorded `t` as the clock (instant, no
  wall-clock wait). Fault scenarios are decode-level transform lambdas `(bms, t) -> bms` on top of a
  committed clean fixture in `shared/fixtures/` (ADR 0012 copy pipeline) — never byte mutation.
- **UI replay** (dev mode): started from the Debug Recordings screen, runs a real session under a
  synthetic `replay:<name>` board id so durable writes (warnings, ride recordings) stay separated
  from real boards and are deletable in one shot. Visible REPLAY badge; stop = normal disconnect.

iOS gains Debug Recording capture (removing the `@platform-diff` in `RecordingCoordinator.swift`)
so both platforms record and replay.

## Considered Options

- **Byte-level fault fixtures** (mutate BMS payloads + CRC into a second `.jsonl`). Rejected:
  needs a BMS re-encoder that exists nowhere else, produces an unreadable/undiffable artifact, and
  the clean run already exercises the byte→decode path end-to-end.
- **Detector-level mock feeding only** (no transport seam, hand-built frames). Rejected as the only
  mechanism: it cannot validate against real noise/timing, which is the whole false-positive story.
  It survives as the transform-lambda layer on top of replayed real frames.
- **Virtual clock for fast-forward replay.** Rejected for v1: controller and detectors read wall
  clock in many places; injecting a clock everywhere is a large refactor. UI replay is 1× only;
  unit tests bypass wall clock by passing recorded `t` directly.
- **Full-real board id for UI replay.** Rejected: pollutes Ride History and warning stores of real
  boards; synthetic id keeps end-to-end write paths exercised while staying cleanable.

## Consequences

- `BoardSessionController` needs transport injection (today it constructs `VescGattClient`
  internally) — a factory/interface seam on both platforms.
- Request/response FSMs (config read, Link Integrity probe) receive replies on the recording's
  schedule, not theirs; usually aligned since the original session issued the same requests, but
  occasional timeouts during replay are accepted dev-tool behavior.
- Committed clean fixtures make real-ride false positives CI failures: a detector change that fires
  on a healthy recorded ride must be investigated, not snapshotted away.
- Config-scoped detection is replayable too (the v1 "telemetry-only" cut was lifted): a harness
  drives the **real** `ConfigRW` controller/FSM with the recording's reassembled `rx` packets to
  reconstruct the Refloat config read, then feeds the decoded `ConfigSafetyValues` to
  `ConfigSafetyDetector`. No FSM re-implementation — the same schema parser and config decoder the
  live session uses run in the harness; only request sending and side effects are stubbed. Fault
  scenarios transform the decoded config values (never bytes). The one real-recording caveat: the
  fixture must contain a completed config read (Thor301 does).
