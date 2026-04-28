# Architecture

→ [index](./index.md)

## Hardware topology

```
Phone (Android)
  │  BLE / Nordic UART Service (NUS)
  ▼
ESP32 "VESC Express"   ← BLE bridge, runs VESC Express firmware v6.05
  │  CAN bus
  ▼
STM32 VESC             ← motor controller, runs Refloat VESC package
```

The ESP32 handles only a few commands itself (`COMM_FW_VERSION`, `COMM_PING_CAN`).
Everything else must be wrapped with `COMM_FORWARD_CAN` so the ESP32 relays it over CAN.

## BLE profile

Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART)

| Characteristic | UUID | Role |
|---|---|---|
| NUS TX | `6e400002` | Phone **writes** here; ADV2 also **notifies** here |
| NUS RX | `6e400003` | Present in GATT but ADV2 does **not** notify on it |

**Key quirk**: ADV2 firmware (`comm_ble.c`) sets `notify_conn_id` inside the write handler for `6e400002`. So both writes and notifications travel on `6e400002` — non-standard NUS but that's what the firmware does.

## Code layout

```
modules/vesc-ble/          custom Expo native module (Android)
modules/vesc-ble/android/.../VescBleModule.kt
                           Expo module bridge — scan and session API
modules/vesc-ble/android/.../VescForegroundService.kt
                           native BLE/demo session owner
src/store/bleStore.ts      Zustand store — mirrors native session events
src/vesc/commands.ts       COMM_* enum + request builders
src/vesc/packet.ts         VESC packet framing (encode/decode)
src/vesc/reassembler.ts    reassemble multi-chunk BLE→VESC packets
src/vesc/refloat.ts        Refloat GET_ALLDATA builder + parser
src/vesc/types.ts          TypeScript types (VescValues, RefloatValues)
app/device/[id].tsx        telemetry screen
```
