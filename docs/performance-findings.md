# Performance Findings — Live Telemetry

## Problem

JS thread lag >300ms when accumulating 10 minutes of live telemetry history. Occurred regardless of whether sparklines or live status bar were visible.

## Root Cause Analysis

### 1. Dev-mode overhead (46% of CPU)

React DevTools profiling (`structuredCloneInternal` + `reportMeasure`) consumed nearly half the JS thread budget. This disappears entirely in production builds.

### 2. Per-component metric projection (fixed)

Old approach: `projectLiveMetricHistory()` created 12 typed arrays every 1Hz publish, stored in zustand state. Each card component received full history object and picked its slice — but zustand still diffed the entire object on every update.

### 3. Double-render from useSyncExternalStore (fixed)

Intermediate attempt used `useSyncExternalStore` for metric data. Problem: `useSyncExternalStore` triggers synchronous re-renders that cannot batch with zustand updates. Components rendered twice per publish cycle.

## Architecture (current)

```
BLE packet → native hot path (parse, alerts, battery %, notification, latest sample)
               │
               └── 200ms native cold path → TelemetryPipeline.process()
                                           → emitEvent("onTelemetry")
                                                   │
                                                   ▼
                                      liveTelemetryRuntime (mutable buffer + SharedValues)
                                                   │
                                                   ├── SharedValues → Reanimated UI
                                                   │                  No React render needed
                                                   │
                                                   └── 1Hz timer → zustand set({ metricVersion, liveStatus, liveLocationHistory })
                                                                       │
                                                                       └── useLiveMetric(selector) → useMemo + module-level cache
                                                                           Projects from raw buffer on demand
                                                                           Cache keyed by (version, selector fn ref)
                                                                           Cleared on version bump
                                                                           Shared across all components in same render frame
```

### Key design decisions

| Decision                                            | Why                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Native hot/cold telemetry split                     | Alert feedback and notifications react per BLE packet while bridge events stay bounded.      |
| Mutable buffer, not zustand state                   | Avoid creating new arrays every sample. Buffer holds ~1500 items at 5min window.             |
| Module-level projection cache                       | Multiple cards use same buffer. Project once per selector per frame, not once per component. |
| Version counter in zustand                          | Single primitive selector. All metric consumers batch into one React render pass.            |
| SharedValues for real-time display                  | Speed gauge, duty %, temps update at cold-path rate (~5Hz) without React renders.            |
| 1Hz publish rate (`LIVE_HISTORY_PUBLISH_MS = 1000`) | Charts don't need faster updates. Keeps React render budget low. Do not decrease this value. |

## Performance characteristics

| Metric                                        | Value                              |
| --------------------------------------------- | ---------------------------------- |
| Native hot-path rate                          | Board poll interval, default 10 Hz |
| JS bridge / cold-path rate                    | ~5 events/sec                      |
| Buffer size at 5min/5Hz                       | ~1500 telemetry samples            |
| Projection cost (single selector, 1500 items) | <1ms                               |
| React renders per publish                     | 1 batch (all metric consumers)     |
| SharedValue updates                           | ~5/sec, zero React cost            |
| Production JS lag (10min history)             | <50ms                              |

## What NOT to do

- **Don't store projected arrays in zustand** — creates new refs every publish, triggers diffing on large objects.
- **Don't use `useSyncExternalStore` alongside zustand** — causes double renders because sync external store fires outside React's batching window.
- **Don't reduce `LIVE_HISTORY_PUBLISH_MS`** — 1Hz is sufficient for charts. Lower values multiply render cost without visual benefit.
- **Don't iterate buffer per-component** — always use the shared projection cache.
- **Don't trust dev-mode profiling numbers** — React DevTools adds 40-50% overhead. Always verify perf issues exist in production builds before optimizing.

## Files

| File                                    | Role                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `src/telemetry/liveTelemetryRuntime.ts` | Mutable buffer, SharedValues, version counter, snapshot publishing |
| `src/telemetry/liveMetricHistory.ts`    | Buffer ops: insert, prune, dedup, summarize                        |
| `src/hooks/useLiveMetric.ts`            | React hook with module-level projection cache                      |
| `src/store/bleStore.ts`                 | Zustand store, 1Hz publish timer, event subscriptions              |
