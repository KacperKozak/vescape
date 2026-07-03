# iOS Port Strategy

The iOS port is built subsystem-by-subsystem. Each subsystem must be verified on a real device before the next subsystem becomes durable work. iOS support is an Expo/RN app surface backed by native Swift modules where board, storage, and long-lived work need platform ownership.

We do not keep an iOS mock and we do not support the simulator for board features. CoreBluetooth is the only iOS BLE path, and device verification is required because the critical behavior is native radio, background execution, and reconnect behavior.

The iOS `vesc-ble` implementation mirrors the Android folder structure one-to-one inside `modules/vesc-ble/ios/` so the platform ports stay comparable while remaining native-first. The TypeScript interface at `modules/vesc-ble/src/index.ts` is the API parity contract between RN and both native implementations.

## Decisions

- Port one subsystem at a time and verify each on a real iOS device before starting the next durable subsystem.
- Delete the iOS mock path. Use real CoreBluetooth only; simulator support is out of scope for board features.
- Mirror the Android module shape one-to-one in `modules/vesc-ble/ios/`.
- Use GRDB.swift for all iOS storage, including telemetry and app data, in one SQLite database. This matches the Android Room boundary: native owns durable truth, JS renders state and sends intents.
- Add `UIBackgroundModes` values `bluetooth-central`, `location`, and `audio` through Expo config so generated `Info.plist` gets the required background modes.
- Request GPS as When In Use and pair it with the `location` background mode. Location background execution is part of the reconnect strategy, not a separate source of durable truth.
- Rewrite the VESC protocol in Swift and port the Android protocol tests instead of sharing runtime code.
- Reconnect uses CoreBluetooth persistent connect plus active rescan while the app is alive via the `location` background mode. This is a risk area and needs thorough real-device testing.
- Follow ADR 0015: a Board's reachability is resolved by Board Probe before connect and stored as a complete Board Link `{ bleId, transport }`, where transport is `direct` or `canId`. Runtime connect is dumb: it reads the stored Board Link and polls immediately, with no CAN-ping discovery or timeout.
- Treat Board Probe as its own native subsystem with its own GATT detection session. Connect is gated on the Board Link.
- Skip Tunes config read/write in the initial iOS port because the Android flow is not yet tested enough to be a stable source of truth.
- Keep Kotlin Multiplatform rejected per ADR 0010. The pure-Kotlin Android modules document a portable shape, but iOS reimplements the native services in Swift.

## Considered Options

- **Keep the iOS mock while porting.** Rejected because it hides native BLE and background behavior, which are the risky parts of the port.
- **Support simulator mode for board features.** Rejected because CoreBluetooth board behavior, reconnect, and background execution require physical-device validation.
- **Share business logic through Kotlin Multiplatform.** Rejected by ADR 0010. Current priority is a sharp native port, not cross-platform build complexity.
- **Rediscover Board Transport during connect.** Rejected by ADR 0015. Runtime connect must stay deterministic and use the stored Board Link.
- **Use separate storage databases for telemetry and app data.** Rejected because one native database keeps durable app truth under one migration and transaction boundary, matching the Android Room architecture.

## Consequences

- Expo config owns the iOS `Info.plist` additions because generated `ios/` files are not durable source.
- The iOS native module surface stays aligned with Android by folder shape and TypeScript API, not by shared implementation language.
- Reconnect behavior remains explicitly risky until proven with real-device tests covering background location, CoreBluetooth restoration/persistent connect, active rescans, and board power/range changes.
- Board Link and Board Probe are hard architecture boundaries for iOS from the start. A Board without a Board Link cannot start a Board Session.
- Tune Profile and Tune Snapshot work can come later, after Android config read/write has stronger device evidence and tests worth porting.

## References

- ADR 0010: Pure-logic modules in native services
- ADR 0015: Board Transport detected at setup, not at connect
