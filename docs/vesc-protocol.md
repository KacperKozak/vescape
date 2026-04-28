# VESC Protocol

→ [index](./index.md) | [architecture](./architecture.md) | [refloat-alldata](./refloat-alldata.md)

## Packet framing

Short packet (payload ≤ 255 bytes):
```
[0x02] [len: 1B] [payload: N bytes] [crc_hi] [crc_lo] [0x03]
```
CRC: CRC-16/XMODEM, poly=0x1021, init=0x0000, big-endian.

The reassembler (`src/vesc/reassembler.ts`) handles packets split across multiple BLE MTU chunks.

## Command IDs (subset)

| Name | ID | Notes |
|---|---|---|
| `COMM_FW_VERSION` | 0x00 | Handled by ESP32 locally. Use as connectivity ping — it generates a response. |
| `COMM_GET_VALUES` | 0x04 | Standard motor telemetry. Must be CAN-forwarded on ADV2. |
| `COMM_ALIVE` | 0x1E | Keepalive. **No response** — useless as a connectivity test. |
| `COMM_FORWARD_CAN` | 0x22 | Prefix wrapper: `[0x22, canId, <actual command>]` |
| `COMM_CUSTOM_APP_DATA` | 0x24 | Refloat package commands. Must be CAN-forwarded. |
| `COMM_PING_CAN` | 0x3E | ESP32 discovers CAN bus devices. Response: `[0x3E, id0, id1, ...]` |

## Problem: GET_VALUES never responded

**Symptom**: `COMM_GET_VALUES` (0x04) sent successfully (write-with-response confirmed), but zero notification packets received.

**Cause**: The ESP32 is a dumb BLE→CAN bridge. It only handles `COMM_FW_VERSION` locally. All other commands including `COMM_GET_VALUES` must be addressed to a specific CAN device ID and prefixed with `COMM_FORWARD_CAN`. Without the prefix the ESP32 has no motor controller CAN ID to forward to.

**Fix**:
1. Send `COMM_PING_CAN` immediately after connect to discover the motor controller's CAN ID
2. Wrap all motor commands: `[0x22, canId, <cmd>]`

```kotlin
// VescForegroundService does this natively after GATT setup.
sendPayload(byteArrayOf(COMM_PING_CAN.toByte()))

// On [0x3E, id0, id1, ...], store id0 and start native polling.
sendPayload(byteArrayOf(
  COMM_FORWARD_CAN.toByte(),
  canId.toByte(),
  COMM_CUSTOM_APP_DATA.toByte(),
  REFLOAT_MAGIC.toByte(),
  REFLOAT_GET_ALLDATA.toByte(),
  2,
))
```

## Connect sequence

```
1. nativeConnect(deviceId)                  — GATT connect, MTU 517, CCCD writes
2. wait 500ms                               — peripheral activates CCCD
3. send COMM_FW_VERSION (0x00)              — confirms notification path is alive
4. wait 300ms
5. send COMM_PING_CAN (0x3E)               — discover motor controller CAN ID
   → on response: store canId, start polling
6. poll every 500ms:
   send [FORWARD_CAN, canId, CUSTOM_APP_DATA, 101, GET_ALLDATA, 2]
```

Note: `COMM_ALIVE` (0x1E) was tried as the first ping — it generates no response, so it cannot confirm the notification path. `COMM_FW_VERSION` must be used instead.
