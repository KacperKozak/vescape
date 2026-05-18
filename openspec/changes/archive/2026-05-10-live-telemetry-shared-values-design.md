# Live Telemetry Shared Values Design

## Purpose

The live dashboard must stay responsive during a full five-minute telemetry window. Current UI state publishes a growing `recentTelemetry` array through Zustand on every telemetry frame. Many cards subscribe to that array, remap it into chart points, and rebuild SVG paths. At live packet rates this makes the JS thread lag.

The new design separates hot live values from slower chart history.

## Goals

- Keep speed gauge in sync with live speed frames.
- Keep duty cycle, motor current, battery current, and other current numeric readouts as live as possible.
- Keep the live status bar cheap while still showing whether board and GPS data are fresh.
- Allow sparklines and detail charts to lag slightly.
- Preserve native ownership of durable truth, lifecycle recovery, recording, and stored history.
- Remove the public `recentTelemetry` UI API instead of keeping compatibility shims.

## Non-Goals

- Do not move durable telemetry storage to JS.
- Do not redesign historical session playback.
- Do not optimize native BLE parsing or packet rate in this change.
- Do not keep dead `recentTelemetry` consumers for later.

## Architecture

Native remains the owner of BLE connection state, recording, and restore snapshots. JS owns only live presentation state.

Add a live telemetry runtime module that owns:

- Reanimated shared values for hot metrics.
- Mutable ring buffers for the five-minute chart window.
- A throttled publisher that derives recent live metric history from ring buffers and writes it to Zustand.

Zustand keeps connection/status state and slow live-history state. It no longer publishes a full telemetry sample list on every frame.

## Data Model

Hot runtime values are Reanimated shared values, not React state:

```ts
speedKmh: SharedValue<number | null>
dutyPercent: SharedValue<number | null>
motorCurrent: SharedValue<number | null>
batteryCurrent: SharedValue<number | null>
batteryVoltage: SharedValue<number | null>
motorTemp: SharedValue<number | null>
controllerTemp: SharedValue<number | null>
lastPacketAt: SharedValue<number | null>
avgLatencyMs: SharedValue<number | null>
```

Slow live-history state is metric-specific. It can feed sparklines, detail charts, recent stats, and any other UI that needs recent telemetry history:

```ts
liveMetricHistory: {
  speed: LiveMetricPoint[]
  duty: LiveMetricPoint[]
  motorCurrent: LiveMetricPoint[]
  batteryCurrent: LiveMetricPoint[]
  batteryVoltage: LiveMetricPoint[]
  motorTemp: LiveMetricPoint[]
  controllerTemp: LiveMetricPoint[]
  footpadAdc1: LiveMetricPoint[]
  footpadAdc2: LiveMetricPoint[]
  pitch: LiveMetricPoint[]
  roll: LiveMetricPoint[]
  balancePitch: LiveMetricPoint[]
}
hasLiveTelemetry: boolean
sampleCount: number
```

Live status state is a small summary, not a sample list:

```ts
liveStatus: {
  boardSampleCount: number
  boardLastPacketAt: number | null
  boardAvgLatencyMs: number | null
  gpsSampleCount: number
  gpsLastFixAt: number | null
  gpsPrecise: boolean
  gpsAccuracyM: number | null
}
```

The runtime may keep full telemetry samples internally if that is the simplest ring buffer implementation, but components must not subscribe to full samples.

## Ingest Flow

On startup, foreground restore, or JS reload:

1. JS asks native for live state.
2. Native snapshot seeds ring buffers.
3. Latest snapshot sample seeds hot shared values.
4. Runtime publishes initial live metric history.

On each telemetry frame:

1. Validate generation against the current connection sequence.
2. Update hot shared values immediately.
3. Append the sample to the mutable ring buffer.
4. Update small live status counters and timestamps.
5. Prune the ring buffer to the configured live window.
6. Schedule a live-history publish if none is pending.

On live-history publish:

1. Derive metric-specific recent history from ring buffers.
2. Write recent history and sample metadata to Zustand.
3. Run on a fixed throttle, initially 250 ms.

## UI Flow

`SpeedGauge` must be a hot component. It receives the speed shared value and drives the number, active arc, glow wedge, and marker through Reanimated animated props. The speed gauge should not need a React render for each telemetry frame.

Duty cycle, motor current, and battery current cards use animated numeric text for their live readouts. Their sparklines use throttled live metric history.

Other cards follow the same split when useful:

- Numeric current value reads from a shared value.
- Sparkline reads from a metric-specific live metric history array.
- Status labels and connection UI read normal Zustand state.

`LiveStatusBar` must not subscribe to `liveMetricHistory` or full telemetry samples. It reads only connection status plus the small `liveStatus` summary. If the board latency number needs frame-level freshness, it reads `avgLatencyMs` through animated text. Age labels can continue to tick once per second because age display does not need packet-rate React renders.

## SpeedGauge Details

Create animated SVG wrappers for `react-native-svg` primitives:

```ts
const AnimatedPath = Animated.createAnimatedComponent(Path)
const AnimatedLine = Animated.createAnimatedComponent(Line)
```

Animated props derive geometry from `speedKmh.value`:

- Active arc `Path.d`
- Glow wedge `Path.d`
- Marker `Line` coordinates
- Numeric text via animated text input props

If Android support for animated `Path.d` is unreliable, fallback to React-throttled gauge geometry at 15-30 Hz while keeping the numeric speed text on a shared value. This fallback is acceptable only after verifying animated SVG props fail.

## Error Handling

Invalid or stale generation frames are ignored.

If a telemetry field is missing or not finite, the runtime leaves that shared value unchanged unless the field represents a disconnected or reset state. On disconnect, hot values reset to `null`, ring buffers clear or stop accepting new frames, and live-history state publishes an empty or final disconnected view.

Native restore errors remain surfaced through existing BLE error state.

## Testing

Unit tests cover ring buffer pruning, snapshot seeding, generation filtering, and throttled live-history publishing.

Component-level tests or focused runtime tests verify that telemetry frames update hot shared values without requiring a `recentTelemetry` Zustand update.

Manual Android verification covers:

- Five-minute live telemetry window.
- Speed number and gauge marker/arc stay in sync with live speed.
- Duty/current numbers do not visibly lag.
- LiveStatusBar shows board/GPS freshness without subscribing to full telemetry history.
- Sparklines update smoothly enough at the throttle interval.
- JS reload and OS restore seed live state from native snapshot.

## Migration

Replace `recentTelemetry` consumers with metric-specific APIs.

Delete per-frame `appendByTimestamp` telemetry publishing from `bleStore`.

Keep native live snapshots, native history APIs, and session history behavior unchanged.
