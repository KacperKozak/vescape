# BLE Debugging Log — Floatwheel ADV2 + React Native + Android

## Device Under Test
- **Board**: Floatwheel ADV2 (`B0:81:84:0E:74:EE`, public address)
- **Phone**: Pixel 9 Pro XL, Android 16
- **Status**: **BONDED** (confirmed via `adb shell dumpsys bluetooth_manager`)
  - Bonded packages: `com.floaty.floatyapp`, `com.anonymous.vescpoc`, `no.nordicsemi.android.mcp`
- **BLE profile**: Nordic UART Service (NUS)
  - Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
  - TX char (phone→device write **AND** device→phone notify): `6e400002` — **non-standard dual-role**
  - RX char (6e400003): present in GATT table but **NOT used for notifications by ADV2 firmware**
- **MTU**: negotiated to 517 bytes

---

## Stack
- Expo SDK 54, React Native 0.81.5
- **New Architecture enabled** (`newArchEnabled: true` in app.json)
- Custom native Expo module `vesc-ble` (`modules/vesc-ble/`) — replaces react-native-ble-plx
- Bun 1.3.11

---

## What Works ✅

| Feature | Status |
|---------|--------|
| BLE scanning | ✅ finds ADV2 by name prefix |
| BLE connection | ✅ connects, MTU 517, GATT discovery |
| Writing to TX char (6e400002) | ✅ `writeWithResponse` and `writeWithoutResponse` confirmed |
| CCCD write on TX char (6e400002) | ✅ `onDescriptorWrite status=0` confirmed |
| JS event emission | ✅ custom module emits all events correctly on New Architecture |
| BLE notifications from TX char (6e400002) | ✅ **FIXED** — see Root Cause §3 below |
| Telemetry data (GET_VALUES response) | ✅ receiving and parsing live data |

---

## Root Cause Analysis

### Layer 1 — Event Emission (FIXED, not the root cause)
**Symptom**: `DeviceEventEmitter.addListener('ReadEvent', ...)` never fires
**Diagnosis**: `sendEvent()` in `BlePlxModule.java` called `getJSModule(RCTDeviceEventEmitter).emit()` from a BLE background thread. In React Native New Architecture (bridgeless mode), this silently drops events.
**Fix attempted** (in `patches/react-native-ble-plx@3.5.1.patch`):
```java
private void sendEvent(@NonNull Event event, @Nullable Object params) {
  getReactApplicationContext().runOnJSQueueThread(() -> {
    getReactApplicationContext()
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
      .emit(event.name, params);
  });
}
```
**Confirmed working for scan events**, but not the root cause of missing notifications — the native `onCharacteristicChanged` callback was never firing at all.

---

### Layer 2 — react-native-ble-plx / rxandroidble2 broken on Android 13+ (ABANDONED)

**Symptom**: Even after the event-emission patch and forcing `QUICK_SETUP` to write the CCCD, `onCharacteristicChanged` never fired in the native GATT log.

**Diagnosis**: `react-native-ble-plx@3.5.1` uses `rxandroidble2` internally. On Android 13+ (API 33), Android split `BluetoothGattCallback.onCharacteristicChanged` into a new 3-param signature `(gatt, characteristic, value: ByteArray)`. `rxandroidble2` only overrides the deprecated 2-param version, so on API 33+ the new 3-param method is called by the OS but the library never handles it. This is a known unfixed bug (issue #1292).

**Resolution**: Abandoned `react-native-ble-plx` entirely. Built a custom native Expo module `vesc-ble` that owns the `BluetoothGattCallback` directly and overrides both signatures.

---

### Layer 3 — Wrong Characteristic UUID for Notifications (ROOT CAUSE, FIXED ✅)

**Symptom**: Custom `vesc-ble` module connected successfully, CCCD written successfully (`onDescriptorWrite status=0`), but `onCharacteristicChanged` still never fired.

**Investigation**: Decompiled the official Floatwheel APK using `jadx` + `hermes-dec` (the JS bundle is Hermes bytecode, HBC v96). Found this in the decompiled connection logic:
```javascript
r9 = r2.VESC_SERVICE_UUID;       // 6e400001-...
r8 = r2.VESC_CHARACTERISTICS_TX_UUID;  // 6e400002 ← TX char, NOT RX char!
r0 = r11[r5](r10, r9, r8, r7, r6);    // monitorCharacteristicForDevice(...)
```

**Root cause**: The ADV2 firmware (VESC Express) sends notifications on **`6e400002` (TX char)**, not on `6e400003` (RX char) as the standard NUS spec says. The board uses a single characteristic (`6e400002`) bidirectionally: the phone writes to it, and the board notifies on it.

This is a VESC Express firmware quirk. Looking at `comm_ble.c`, the `notify_conn_id` is set inside `char1_write_handler()` — the characteristic write handler for `6e400002`. The firmware effectively treats `6e400002` as both the write target and the notification source.

**Fix applied** in `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt`:
- `setCharacteristicNotification()` called on TX char (`6e400002`) instead of RX char
- CCCD descriptor written on TX char's descriptor
- `onCharacteristicChanged` filters for `NUS_TX_UUID` (`6e400002`) instead of `NUS_RX_UUID`

```kotlin
// Was: gatt.setCharacteristicNotification(rxChar, true)
//      val cccd = rxChar.getDescriptor(CCCD_UUID)
// Now:
val notifOk = gatt.setCharacteristicNotification(tx, true)
val cccd = tx.getDescriptor(CCCD_UUID)

// Was: if (characteristic.uuid == NUS_RX_UUID)
// Now:
if (characteristic.uuid == NUS_TX_UUID) {
  sendEvent("onNotification", mapOf("value" to Base64.encodeToString(value, Base64.NO_WRAP)))
}
```

---

## Key Observations from Android GATT Logs

### Successful connection sequence with `vesc-ble` module (working)
```
connectGatt → B0:81:84:0E:74:EE
onConnectionStateChange status=0 newState=2   ← connected
connected — requesting MTU 517
onMtuChanged mtu=517 status=0
onServicesDiscovered status=0
txChar=6e400002-...
setCharacteristicNotification(TX)=true
writing CCCD 0x0100
writeDescriptor (API33+) status=0
onDescriptorWrite uuid=00002902-... status=0
CCCD written on TX char — resolving connect
onConnected (mtu=517) emitted to JS
[BLE] onNotification len: XX               ← notifications flowing ✅
```

### Failed connection attempts (status=133)
The first connect attempt often fails with `onConnectionStateChange status=133` (GATT_ERROR / connection timeout). This is a known Android quirk on bonded devices — retry immediately and it succeeds. The module already handles this: `doConnect()` cleans up and the JS layer can retry.

### nRF Connect CCCD behaviour
nRF Connect skips `writeDescriptor` on reconnect because it wrote the CCCD in a previous session and the bonded device retained that state. Our module always re-writes it explicitly to ensure clean state.

---

## Competing Apps Warning

**nRF Connect (`no.nordicsemi.android.mcp`) must be closed** before testing. When running in background, it:
- Reconnects to ADV2 automatically
- Shares the BLE connection (two GATT clients simultaneously)
- May interfere with CCCD state and connection slots

Similarly, the **official Floatwheel app (`com.floaty.floatyapp`)** is bonded and may auto-connect.

**Before every test: force-close nRF Connect and Floatwheel app, then power-cycle the ADV2.**

---

## Custom Native Module: `vesc-ble`

The final solution that resolved all three root causes above.

### Architecture
- Located at `modules/vesc-ble/`
- Registered via `modules/vesc-ble/expo-module.config.json` (Expo autolinking)
- Android implementation: `modules/vesc-ble/android/src/main/java/expo/modules/vescble/VescBleModule.kt`
- TypeScript API surface: `modules/vesc-ble/src/index.ts`
- iOS: stub only (returns NOT_IMPLEMENTED)

### Why a custom module was necessary
1. `react-native-ble-plx@3.5.1` / `rxandroidble2` only overrides the deprecated 2-param `onCharacteristicChanged` — broken on Android 13+.
2. The library's CCCD write path stalled silently before reaching the Android GATT API.
3. The firmware quirk (notifications on TX char) required full control of which characteristic gets subscribed.

### Key design decisions in VescBleModule.kt
- Overrides **both** `onCharacteristicChanged` signatures (3-param API 33+, and deprecated 2-param) to handle all Android versions.
- Subscribes notifications on **`6e400002` (TX char)**, not `6e400003`.
- CCCD write uses the API 33+ `writeDescriptor(descriptor, value)` path when available.
- 3-second CCCD timeout fallback for bonded-device edge case (CCCD ack sometimes never fires).
- First 3 writes use `WRITE_TYPE_DEFAULT` (write-with-response) for confirmation; subsequent writes use `WRITE_TYPE_NO_RESPONSE` for throughput.

### Diagnostic logs
```bash
# All VescBle native logs:
adb logcat -s VescBle:D

# Full working connection sequence to look for:
# connectGatt → <address>
# onMtuChanged mtu=517 status=0
# onServicesDiscovered status=0
# setCharacteristicNotification(TX)=true
# writeDescriptor (API33+) status=0
# onDescriptorWrite uuid=00002902-... status=0
# CCCD written on TX char — resolving connect
# onCharacteristicChanged(3-param) uuid=6e400002-... len=XX   ← THIS is what was missing
```

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

Uses `vesc-ble` native module (not react-native-ble-plx). The `connect()` method does the following in order:

1. Wire up `addNotificationListener` **before** calling `nativeConnect()` to avoid missing early packets
2. Wire up `addDisconnectedListener`
3. `nativeConnect(deviceId)` — internally: connectGatt → requestMtu(517) → discoverServices → setCharacteristicNotification(TX) → writeDescriptor(CCCD) → resolve
4. Wait 500ms for peripheral to activate CCCD
5. Send COMM_ALIVE (0x1E) ping
6. Polling starts (bleStore.ts): GET_VALUES every 500ms via `vescBle.send()`

Incoming notifications are reassembled by `src/vesc/reassembler.ts` (handles multi-chunk VESC packets split across BLE MTU boundaries).
