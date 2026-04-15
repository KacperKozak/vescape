# BLE Debugging Log — Floatwheel ADV2 + react-native-ble-plx + New Architecture

## Device Under Test
- **Board**: Floatwheel ADV2 (`B0:81:84:0E:74:EE`, public address)
- **Phone**: Pixel 9 Pro XL, Android 15
- **Status**: **BONDED** (confirmed via `adb shell dumpsys bluetooth_manager`)
  - Bonded packages: `com.floaty.floatyapp`, `com.anonymous.vescpoc`, `no.nordicsemi.android.mcp`
- **BLE profile**: Nordic UART Service (NUS)
  - Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
  - TX char (phone→device, write): `6e400002` — `writeResp=true writeNoResp=true notify=false`
  - RX char (device→phone, notify): `6e400003` — `notify=true writeResp=false writeNoResp=false`
- **MTU**: negotiated to 517 bytes

---

## Stack
- Expo SDK 54, React Native 0.81.5
- **New Architecture enabled** (`newArchEnabled: true` in app.json)
- `react-native-ble-plx@3.5.1` (rxandroidble2 1.17.2 internally)
- Bun 1.3.11

---

## What Works ✅

| Feature | Status |
|---------|--------|
| BLE scanning | ✅ finds ADV2 by name prefix |
| BLE connection | ✅ connects, MTU 517, GATT discovery |
| Writing to TX char (6e400002) | ✅ `writeWithoutResponse` sends VESC packets |
| JS event emission (ScanEvent) | ✅ confirmed via VESCBLE logcat tag |
| `runOnJSQueueThread` dispatch | ✅ `sendEvent emit on JS thread` fires for scan events |

## What Doesn't Work ❌

| Feature | Status |
|---------|--------|
| BLE notifications from RX char (6e400003) | ❌ never received |
| `monitorCharacteristic.onEvent` native callback | ❌ never fires |
| `onCharacteristicChanged` in Android GATT log | ❌ never appears |
| Telemetry data (GET_VALUES response) | ❌ 0 packets received |

---

## Root Cause Analysis

### Layer 1 — Event Emission (FIXED, not the root cause)
**Symptom**: `DeviceEventEmitter.addListener('ReadEvent', ...)` never fires
**Diagnosis**: `sendEvent()` in `BlePlxModule.java` called `getJSModule(RCTDeviceEventEmitter).emit()` from a BLE background thread. In React Native New Architecture (bridgeless mode), this silently drops events.
**Fix applied** (in `patches/react-native-ble-plx@3.5.1.patch`):
```java
private void sendEvent(@NonNull Event event, @Nullable Object params) {
  getReactApplicationContext().runOnJSQueueThread(() -> {
    getReactApplicationContext()
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(event.name, params);
  });
}
```
**Confirmed working**: ScanEvent, DisconnectionEvent now reach JS correctly.
**Not the root cause of missing notifications**: the native `onEvent` callback is never called at all.

---

### Layer 2 — CCCD Not Written (ROOT CAUSE, partially addressed)

**Symptom**: `adb logcat BluetoothGatt:D` shows `setCharacteristicNotification(6e400003) enable=true` but **NO `writeDescriptor()` call**.
Without writing `0x0100` to the CCCD descriptor, the peripheral doesn't send notifications.

**Diagnosis**: In `BleModule.java` (`adapter/`), notification setup mode selection:
```java
BluetoothGattDescriptor cccDescriptor = characteristic.getGattDescriptor(CLIENT_CHARACTERISTIC_CONFIG_UUID);
NotificationSetupMode setupMode = cccDescriptor != null
  ? NotificationSetupMode.QUICK_SETUP   // writes CCCD
  : NotificationSetupMode.COMPAT;       // only setCharacteristicNotification, NO CCCD write
```
When COMPAT is chosen, rxandroidble2 only calls `setCharacteristicNotification()` — it never writes the CCCD descriptor, so the ADV2 never sends notifications.

**Why COMPAT was chosen originally**: Initially suspected the CCCD was not in GATT cache. Actually **CCCD IS present** (`CCCD descriptor found: true` confirmed by our diagnostic log). This looks like a bug in ble-plx/rxandroidble2 on this device.

**Fix 1 applied** (in `patches/react-native-ble-plx@3.5.1.patch`): Changed `BleModule.java` to always use `QUICK_SETUP`.
**Result**: Still no `writeDescriptor()` in GATT logs. rxandroidble2's internal operation queue stalls or fails silently before the `writeDescriptor` reaches the Android GATT API.

**Fix 2 applied** (JS-level, in `src/ble/manager.ts`): Manual CCCD write using `mgr.writeDescriptorForDevice()` before calling `characteristic.monitor()`:
```ts
await this.mgr.writeDescriptorForDevice(
  this.device.id,
  NUS_SERVICE,        // 6e400001-...
  NUS_RX_CHAR,        // 6e400003-...
  '00002902-0000-1000-8000-00805f9b34fb',  // CCCD UUID
  btoa('\x01\x00'),   // base64 of [0x01, 0x00] = enable notifications
);
```
**Status: Untested at time of writing** — Metro was down when this was added.

---

## Key Observations from Android GATT Logs

### Successful connection sequence (our app, PID varies)
```
connect()
onClientRegistered(0)
onClientConnectionState(status=0 connected=true)
configureMTU(244)               ← we request 244, device accepts 517
onConfigureMTU(517, 0)
discoverServices()
onSearchComplete(0)
setCharacteristicNotification(6e400003) enable=true
onConnectionUpdated(interval=39 latency=0 timeout=500)
                                ← writeDescriptor NEVER appears here
```

### Failed connection attempts (status=133)
Before the successful connect, we see two `status=133` failures. This is `GATT_ERROR` / connection timeout. It clears on retry.

### nRF Connect (PID 26871) also skips writeDescriptor
nRF Connect also only calls `setCharacteristicNotification` without `writeDescriptor` on reconnect. This works for nRF Connect because it likely wrote the CCCD in a **previous session** and the bonded device retained the CCCD state.

### Two connections from our app
`adb shell dumpsys bluetooth_manager` showed two connections (conn_id 155 and 156) from our app to the ADV2. One may be stale from a previous session.

---

## Competing Apps Warning

**nRF Connect (`no.nordicsemi.android.mcp`) must be closed** before testing. When running in background, it:
- Reconnects to ADV2 automatically
- Shares the BLE connection (two GATT clients simultaneously)
- May interfere with CCCD state and connection slots

Similarly, the **official Floatwheel app (`com.floaty.floatyapp`)** is bonded and may auto-connect.

**Before every test: force-close nRF Connect and Floatwheel app, then power-cycle the ADV2.**

---

## Patch Infrastructure

### Patch file
`patches/react-native-ble-plx@3.5.1.patch` — applied automatically by bun.

Contains:
1. `BlePlxModule.java`: `runOnJSQueueThread` fix + diagnostic `Log.d` calls
2. `BleModule.java` (adapter): always use `QUICK_SETUP` + CCCD found log

### bun.lock integration
`package.json` has `"patchedDependencies": { "react-native-ble-plx@3.5.1": "patches/react-native-ble-plx@3.5.1.patch" }`.
Bun applies the patch automatically on `bun install`.

### Diagnostic logs (in the patched build)
```bash
# Filter all VESCBLE native logs (excludes noisy ScanEvent entries):
adb logcat -s VESCBLE:D -d | grep -v ScanEvent

# Watch BluetoothGatt GATT operations for one PID:
adb logcat -d | grep BluetoothGatt | grep <PID>

# Find our app's current PID:
adb shell pidof com.anonymous.vescpoc
```

Expected log sequence when working correctly:
```
VESCBLE: CCCD descriptor found: true for char: 6e400003-...
BluetoothGatt: setCharacteristicNotification(6e400003) enable=true
BluetoothGatt: writeDescriptor(00002902-...)          ← KEY: this must appear
BluetoothGatt: onDescriptorWrite(00002902-..., 0)     ← status=0 means success
VESCBLE: monitorCharacteristic.onEvent fired!
VESCBLE: sendEvent called: ReadEvent thread=...
VESCBLE: sendEvent emit on JS thread: ReadEvent
ReactNativeJS: [BLE] notification len: XX
```

---

## Alternative Approaches (if manual CCCD write also fails)

1. **Different BLE library**: `react-native-ble-manager` has different New Architecture support. May have same CCCD write problem.

2. **Polling via BLE reads**: The RX char (6e400003) has `READ` property visible in nRF Connect (not shown in ble-plx flags — worth rechecking). Could poll instead of notify.

3. **Force-remove stale connections**: Before connecting, call `mgr.cancelDeviceConnection(deviceId)` to ensure clean state.

4. **Disable New Architecture**: Would require downgrading `react-native-reanimated` from v4 to v3 (v4 requires New Arch). This would be the nuclear option if all else fails.

5. **Custom Expo module**: Write a thin Kotlin module that uses Android BLE directly with proper New Architecture event emission (using `ReactApplicationContext.getJSModule()` from JS thread).

---

## VESC Protocol (implemented and unit-tested ✅)

- **Framing**: `[0x02][len][payload][crc_hi][crc_lo][0x03]` (short, ≤255 bytes)
- **CRC**: CRC-16/XMODEM, poly=0x1021, init=0x0000
- **COMM_GET_VALUES** (cmd=0x04): 54-byte response, big-endian
- **COMM_ALIVE** (cmd=0x1E): keepalive, no response
- Files: `src/vesc/crc16.ts`, `src/vesc/packet.ts`, `src/vesc/parser.ts`, `src/vesc/reassembler.ts`
- Tests: `src/vesc/__tests__/` — 24 tests, all passing

---

## Current State of `src/ble/manager.ts`

The `connect()` method does the following in order:
1. Stop scan, wait 300ms (avoids Android "operation cancelled" on immediate connect)
2. `connectToDevice(deviceId, { timeout: 10000 })`
3. `requestMTU(244)` — device responds with 517
4. `discoverAllServicesAndCharacteristics()`
5. `characteristicsForService(NUS_SERVICE)` — gets char objects directly
6. **Manual CCCD write** via `writeDescriptorForDevice()` (0x0100 = enable notifications)
7. `rxChar.monitor(callback)` — sets up notification listener
8. Wait 1000ms for peripheral to stabilize
9. Send COMM_ALIVE (0x1E) ping
10. Polling starts (bleStore.ts): GET_VALUES every 500ms
