# VESC Protocol

→ [index](./index.md) | [architecture](./architecture.md) | [refloatAlldata](./refloatAlldata.md)

## Packet framing

Short packet (payload ≤ 255 bytes):

```
[0x02] [len: 1B] [payload: N bytes] [crc_hi] [crc_lo] [0x03]
```

CRC: CRC-16/XMODEM, poly=0x1021, init=0x0000, big-endian.

The reassembler (`src/vesc/reassembler.ts`) handles packets split across multiple BLE MTU chunks.

## Command IDs (subset)

| Name                   | ID   | Notes                                                                         |
| ---------------------- | ---- | ----------------------------------------------------------------------------- |
| `COMM_FW_VERSION`      | 0x00 | Handled by ESP32 locally. Use as connectivity ping — it generates a response. |
| `COMM_GET_VALUES`      | 0x04 | Standard motor telemetry. Must be CAN-forwarded on ADV2.                      |
| `COMM_ALIVE`           | 0x1E | Keepalive. **No response** — useless as a connectivity test.                  |
| `COMM_FORWARD_CAN`     | 0x22 | Prefix wrapper: `[0x22, canId, <actual command>]`                             |
| `COMM_CUSTOM_APP_DATA` | 0x24 | Refloat package commands. Must be CAN-forwarded.                              |
| `COMM_PING_CAN`        | 0x3E | ESP32 discovers CAN bus devices. Response: `[0x3E, id0, id1, ...]`            |

## Problem: GET_VALUES never responded

**Symptom**: `COMM_GET_VALUES` (0x04) sent successfully (write-with-response confirmed), but zero notification packets received.

**Cause**: The ESP32 is a dumb BLE→CAN bridge. It only handles `COMM_FW_VERSION` locally. All other commands including `COMM_GET_VALUES` must be addressed to a specific CAN device ID and prefixed with `COMM_FORWARD_CAN`. Without the prefix the ESP32 has no motor controller CAN ID to forward to.

**Fix**:

1. Resolve the motor controller's CAN ID **once at setup** via Board Probe (`COMM_PING_CAN`), store it as the Board Transport
2. Wrap all motor commands with the stored transport: `[0x22, canId, <cmd>]`

```kotlin
// Setup only: BoardTransportDetector pings to discover responders.
sendPayload(byteArrayOf(COMM_PING_CAN.toByte()))

// Runtime: the stored Board Transport frames each poll — no discovery.
// BoardTransport.Can(canId).frame(cmd) prepends [FORWARD_CAN, canId].
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

CAN id discovery is a setup-time **Board Probe** (`BoardTransportDetector`), not part of
runtime connect. At runtime the stored Board Transport is read and polling starts directly.

```
Board Probe (setup, once):
  connect → COMM_FW_VERSION → COMM_PING_CAN → probe each responder + Direct
  → confirm a transport on first valid telemetry sample → store Board Transport

Runtime connect (every session, dumb):
1. nativeConnect(deviceId)                  — GATT connect, MTU 517, CCCD writes
2. seed direct/CAN mode from stored Board Transport
3. poll every 500ms (no discovery probes):
   direct: send [CUSTOM_APP_DATA, 101, GET_ALLDATA, 2]
   CAN:    send [FORWARD_CAN, canId, CUSTOM_APP_DATA, 101, GET_ALLDATA, 2]
```

Note: `COMM_ALIVE` (0x1E) was tried as the first ping — it generates no response, so it cannot confirm the notification path. `COMM_FW_VERSION` must be used instead.
