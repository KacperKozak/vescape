# BLE on Android — Problems & Fixes

→ [index](./index.md) | [architecture](./architecture.md)

## Overview

Three independent bugs blocked BLE notifications. All three had to be fixed to get data flowing in the native module.

---

## Bug 1 — JS events emitted from the wrong thread on New Architecture

**Symptom**: scan events worked, but characteristic notifications never arrived in JS — no errors, just silence.

**Cause**: the initial BLE bridge emitted JS events from a BLE background thread. In RN New Architecture (bridgeless mode) that emitter path was a no-op, so events were silently discarded.

**Attempted fix**: dispatch via `runOnJSQueueThread`. Scan events started arriving, but notifications still didn't arrive, which exposed Bug 2.

**Final fix**: move BLE handling into the custom native Expo module. See Bug 2.

---

## Bug 2 — notification callback mismatch on Android 13+

**Symptom**: Even after Bug 1 fix and explicit CCCD writes, `onCharacteristicChanged` never fired in native logs.

**Cause**: Android 13 (API 33) split `BluetoothGattCallback.onCharacteristicChanged` into a new 3-parameter signature `(gatt, characteristic, value: ByteArray)`. Code that only handles the deprecated 2-parameter callback will miss notifications entirely on newer Android versions.

**Fix**: the custom native Expo module in `modules/vesc-ble/` owns `BluetoothGattCallback` directly and overrides **both** signatures:

```kotlin
// API 33+ (3-param) — this is what Android 13+ calls
override fun onCharacteristicChanged(
    gatt: BluetoothGatt,
    characteristic: BluetoothGattCharacteristic,
    value: ByteArray
) { ... }

// Legacy (2-param) — called on API < 33
@Deprecated("Deprecated in Java")
override fun onCharacteristicChanged(
    gatt: BluetoothGatt,
    characteristic: BluetoothGattCharacteristic
) { ... }
```

---

## Bug 3 — wrong characteristic UUID for notifications

**Symptom**: custom module connected, CCCD written (status=0), but `onCharacteristicChanged` still never fired.

**Cause**: ADV2 firmware notifies on `6e400002` (the write characteristic), not `6e400003` (standard NUS RX). Initial code subscribed to `6e400003` only.

**Fix**:
1. `setCharacteristicNotification()` called on **both** characteristics
2. CCCD descriptor written on **both** (sequentially — GATT only allows one descriptor write in flight at a time; use `onDescriptorWrite` callback to chain the second write)
3. `onCharacteristicChanged` accepts packets from either UUID

```kotlin
// subscribe both
gatt.setCharacteristicNotification(rxChar, true)  // 6e400003
gatt.setCharacteristicNotification(txChar, true)  // 6e400002

// write CCCDs sequentially via onDescriptorWrite callback
pendingCccdWrites = 2
writeCccd(gatt, rxChar.getDescriptor(CCCD_UUID)!!)
// → onDescriptorWrite fires → writeCccd(gatt, txChar.getDescriptor(CCCD_UUID)!!)

// accept from either
if (char.uuid == NUS_RX_UUID || char.uuid == NUS_TX_UUID) { emit() }
```

---

## Other notes

**GATT cache on bonded devices**: re-connecting a bonded device can return stale attribute handles. Fixed by calling `gatt.refresh()` via reflection before `discoverServices()`:

```kotlin
override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
    try {
        val refresh = gatt.javaClass.getMethod("refresh")
        refresh.invoke(gatt)
    } catch (e: Exception) { /* not available on all firmware */ }
    gatt.discoverServices()
}
```

**status=133 on first connect**: common Android quirk on bonded devices (GATT_ERROR / connection timeout). Retry immediately from JS — it succeeds on the second attempt.

**Competing apps**: nRF Connect and the official board app auto-reconnect in background and can steal the GATT connection. Force-close them before testing.

**Write type**: first 3 writes use `WRITE_TYPE_DEFAULT` (write-with-response) to confirm connectivity. Subsequent writes use `WRITE_TYPE_NO_RESPONSE` for throughput.

**CCCD timeout fallback**: if `onDescriptorWrite` never fires (edge case on some bonded states), a 4-second timeout resolves the connect promise anyway.

---

## Working connection log

```
connectGatt → <address>
onConnectionStateChange status=0 newState=2
connected — requesting MTU 517
onMtuChanged mtu=517 status=0
gatt.refresh() = true
onServicesDiscovered status=0
setCharacteristicNotification(RX 6e400003)=true
setCharacteristicNotification(TX 6e400002)=true
writing CCCD on RX char
onDescriptorWrite char=6e400003 status=0  pendingRemaining=1
writing CCCD on TX char
onDescriptorWrite char=6e400002 status=0  pendingRemaining=0
all CCCDs written — resolving connect
onConnected (mtu=517) emitted to JS
[BLE] onNotification len: XX    ← data flowing
```
