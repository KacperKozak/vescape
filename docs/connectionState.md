# Connection state

→ [index](./index.md)

## Rule

Native owns live truth. JS sends intents and renders native snapshots.

JS must not optimistically set board connection status. If UI shows `connecting`,
`connected`, `stale`, or `error`, that value came from native `LiveState`.

## Shape

Native emits `onLiveState` and exposes `getLiveState()`:

```ts
type LiveState = {
  board: {
    phase:
      | 'idle'
      | 'connecting'
      | 'discovering'
      | 'subscribing'
      | 'waiting_for_telemetry'
      | 'connected'
      | 'stale'
      | 'reconnecting'
      | 'disconnecting'
      | 'error'
    selectedBoardId: string | null
    connectedBoardId: string | null
    bleId: string | null
    name: string | null
    connectionSeq: number
    lastTelemetryAt: number | null
    recentTelemetry: TelemetryEvent[]
    error: string | null
    autoConnect: boolean
  }

  gps: {
    phase: 'idle' | 'starting' | 'active' | 'error'
    latestFix: LocationEvent | null
    recentLocations: LocationEvent[]
    error: string | null
  }

  scan: {
    phase: 'idle' | 'scanning' | 'error'
    devices: DeviceFoundEvent[]
    error: string | null
  }

  recording: {
    enabled: boolean
    activeBoardId: string | null
    startedAt: number | null
  }
}
```

## Runtime split

Android native has separate live runtimes:

- board runtime: BLE GATT, VESC polling, telemetry, reconnect, board recording
- GPS runtime: location listener, latest fix, recent fixes, map data
- scan runtime: BLE scanner owned by the Expo module bridge

Board connect/disconnect must not clear GPS fixes. GPS is app-level map data.

## JS role

`src/store/bleStore.ts` mirrors native state:

- `syncNativeState()` reads `getLiveState()`
- `onLiveState` replaces lifecycle status
- `onTelemetry` appends telemetry only when `connectionSeq` matches
- `onLocation` appends GPS fixes
- foreground restore hydrates recent telemetry from native `getLiveState()`

Commands call native only:

- `connect(boardId)` → `selectBoard(boardId)`
- `disconnect()` → `stopBoard()`
- `startGpsTracking()` → `startLocationUpdates()`
- `startTelemetryRecording()` → `setTelemetryRecordingEnabled(true)`

## Auto-connect

JS controls permissions. After permissions are granted, JS may send connect intent
if settings allow auto-connect and native board phase is `idle` or `error`.

Native owns the actual connection after that. The foreground service keeps BLE work
alive while JS is backgrounded or frozen.

### Fast Connect Stability

The fastest stable path is not to wait longer; it is to avoid competing native
writes during startup.

- `connected` means first valid telemetry arrived, not just GATT ready.
- The runtime connect path is dumb: it seeds direct/CAN mode from the stored Board
  Transport and starts telemetry polling directly, with no startup discovery probes.
  CAN id resolution happens once at setup via Board Probe, not on connect.
- GATT descriptor timeout fallbacks must be canceled after successful CCCD writes,
  otherwise a stale timeout can double-resolve the connection.
- Tune/config reads should not compete with initial telemetry startup. If a config
  read starts while the board is still settling, prefer gating/queuing over adding
  long connection delays.

## Recording

Recording means real ride recording:

- allowed only when board phase is `connected`
- saves board telemetry plus precise GPS samples
- stays active during short native reconnect windows
- stops on explicit board disconnect, fatal board error, or service stop

Standalone GPS does not create ride history. GPS without board is only for map/status.

Debug raw BLE recording is separate. Android Dev → Debug recordings can capture
raw chunks, connection states, and location for diagnosis, then list and export
the JSONL files. Debug replay playback is intentionally removed from the app.

## Restore

On app foreground/resume, JS calls `syncNativeState()` and shows a restoring state
until the first native snapshot arrives. The restored state comes from native
service truth, not from cached JS status.
