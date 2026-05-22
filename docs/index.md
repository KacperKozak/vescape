# VESC PoC — Documentation

**Target device**: Floatwheel ADV2 (VESC-based onewheel)
**Stack**: Expo SDK 54 · React Native 0.81.5 · New Architecture · Android · Bun

## Documents

- [architecture.md](./architecture.md) — hardware topology, BLE profile, protocol stack
- [connectionState.md](./connectionState.md) — native-owned live state, GPS, recording, auto-connect
- [history.md](./history.md) — ride history persistence, grouping, markers, and map rendering
- [bleAndroid.md](./bleAndroid.md) — BLE connection problems & fixes (custom native module)
- [vescProtocol.md](./vescProtocol.md) — VESC packet framing, CAN forwarding, Refloat commands
- [refloatAlldata.md](./refloatAlldata.md) — Refloat `COMMAND_GET_ALLDATA` binary layout
- [tune.md](./tune.md) — Refloat tune screen behavior, basic slider formulas, field groups
- [chargingDetection.md](./chargingDetection.md) — charging indicator investigation & findings
- [alerts.md](./alerts.md) — telemetry alerts: storage, native evaluation, Geiger mode

## Status

| Area                               | State                                               |
| ---------------------------------- | --------------------------------------------------- |
| BLE scan & connect                 | ✅                                                  |
| BLE notifications (Android 13+)    | ✅ fixed — see [bleAndroid.md](./bleAndroid.md)     |
| CAN forwarding to motor controller | ✅ fixed — see [vescProtocol.md](./vescProtocol.md) |
| Refloat GET_ALLDATA telemetry      | ✅                                                  |
| iOS                                | stub only                                           |
