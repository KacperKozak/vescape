# Debug Recording replay drives the real session stack through the transport seam

We need to test Board Warning detectors (and eventually most of the live-session stack) against real
board data without a board present: committed clean recordings guard against false positives, and a
dev-mode UI replay reproduces field behavior almost end-to-end. A Debug Recording already captures
every raw BLE `rx` chunk with relative timestamps, so everything the session stack ever sees is
replayable.

## Decision

Replay injects recorded chunks at the **transport seam** (`VescGattListener` / iOS peer): a
`ReplayTransport` fakes the connect/ready callbacks, emits recorded `rx` chunks and recorded GPS
fixes at their recorded `t` on one merged timeline, and swallows writes. Playback is 1× real time
past the warmup window described below; the recording owns position for the whole session. Everything above the seam — packet reassembly, telemetry
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
- **Fast-forward replay with no clock injection.** Rejected: live series bucket samples by the
  timestamp each carries, so playing fast against wall time compresses a window's worth of ride into
  seconds of chart instead of filling it. Superseded by the session clock below, which shifts time
  rather than compressing it.
- **Full-real board id for UI replay.** Rejected: pollutes Ride History and warning stores of real
  boards; synthetic id keeps end-to-end write paths exercised while staying cleanable.

### Session clock and replay warmup

A replay opens with its live window already filled rather than spending real minutes earning one.
The session reads time through a `SessionClock` (`@parity` pair) instead of the system clock: real
sessions get wall time unchanged, a replay gets a clock that starts one warmup window in the past
and is driven forward as the warmup plays, freezing once it catches up. The first `REPLAY_WARMUP_MS`
of the recording is then dispatched as fast as it decodes, and its samples land stamped across the
span they actually cover.

The original objection — that the controller reads wall clock in many places — is what the clock
addresses rather than works around: every one of those reads goes through one session-scoped seam,
so the timeline a session writes always agrees with the code reading it. Unit replay harnesses are
unaffected; they still pass recorded `t` directly.

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
