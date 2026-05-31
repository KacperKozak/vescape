# Fast telemetry: hot/cold path split

The default 500 ms poll interval limits alert reaction time and gauge responsiveness to 2 Hz. BLE hardware supports 100–200 Hz. Speeding up polling without architecture changes would flood the JS bridge, explode the live-telemetry buffer, and multiply ride-recording storage.

## Decision

Split the per-packet telemetry flow into two paths inside `VescForegroundService`:

**Hot path** — runs on every BLE response at the configured poll rate (default 100 ms, configurable per-board).

1. `parseRefloatGetAllData` (mode 1 or 2)
2. Carry-forward `tempMotor`, `tempMosfet`, `odometer` from the most recent mode 2 response so mode 1 packets appear complete
3. `evaluateAlerts` — native-side, no bridge cost
4. `recordingCoordinator.recordTelemetry` — throttled to 10 Hz (one sample per 100 ms bucket)
5. Update Reanimated `SharedValues` via the existing JSI write path

**Cold path** — runs every ~200 ms (5 Hz), driven by a `Handler.postDelayed` timer independent of poll rate.

1. Take the latest parsed `RefloatTelemetry` from the hot path
2. Run `TelemetryPipeline.process` (capture builder, metric sanitization, stale watchdog)
3. `emitEvent("onTelemetry", ...)` — single bridge event with latest sample
4. JS side unchanged: `ingestTelemetry` → `LiveMetricBuffer` → 1 Hz publish to Zustand

**Mode alternation** — poll payload uses mode 1 (34 bytes, no temps/odometer) by default. Every ~1 s, one poll uses mode 2 (42 bytes, includes temps and odometer). Carry-forward fills mode 1 gaps so all downstream consumers see complete data.

**Poll rate** — stored as a per-board setting with a 100 ms default. No auto-probe on connect for now; manual rate-test available in board setup for users who want to tune further.

## Consequences

- Alert latency drops from 500 ms to the board's poll interval (typically 10–100 ms).
- Gauge (SharedValue) updates match poll rate with zero React render cost.
- JS bridge traffic stays at 5 events/sec regardless of poll rate.
- `LiveMetricBuffer` grows at 5 samples/sec — same order as today's 2/sec.
- Ride recording grows at 10 Hz (5× current) but bounded; no per-packet storage.
- Metric sanitizer runs on cold-path data (5 Hz) — more points than today's 2 Hz, quality improves.
- `docs/performance-findings.md` constraints preserved: 1 Hz Zustand publish, SharedValues for real-time display, module-level projection cache.

## Considered Options

- **Speed up poll rate and send everything over the bridge.** Rejected: 100+ bridge events/sec floods JS thread, `LiveMetricBuffer` grows to 60k+ objects (multi-MB), sparkline rendering degrades.
- **Native-side peak annotations in bridge events** (min/max per cold-path bucket). Deferred: 5 Hz latest-sample is already 2.5× current resolution. Can add peak fields later without architectural change.
- **Auto-probe poll rate on every connect.** Deferred: adds 15–20 s delay or parallel-probe complexity. Fixed default + manual probe is simpler to ship and debug.
- **Record every packet.** Rejected: 200 Hz × 30 min = 360k frames per ride. SQLite pressure, storage bloat, ride-history load times. 10 Hz captures board state changes adequately.
- **Peak-preserving recording buckets** (keep min/max extreme sample per 100 ms window). Deferred: adds complexity to the recording hot path. Simple 10 Hz decimation first; peak bucketing can be layered on later.
