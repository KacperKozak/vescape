# iOS

## Background Ride Recording

iOS has no Android `ForegroundService` equivalent. A locked-screen ride cannot rely on a permanent BLE worker or notification. The implementable path for this app is native iOS ownership of the ride session, with background location used as the legitimate long-running activity and CoreBluetooth used for BLE event restoration.

### Implement

- Keep `UIBackgroundModes` in Expo config for `bluetooth-central` and `location`.
- Implement native `CLLocationManager` ride tracking:
  - start when a Board Session starts;
  - stop when the rider explicitly stops the Board Session;
  - set `allowsBackgroundLocationUpdates = true`;
  - set `pausesLocationUpdatesAutomatically = false`;
  - request the location permission level needed for locked-screen ride recording.
- Keep BLE polling and telemetry persistence in native Swift. JS should render state and send intents, not own durable ride work.
- Add CoreBluetooth state preservation/restoration:
  - create `CBCentralManager` with `CBCentralManagerOptionRestoreIdentifierKey`;
  - implement `centralManager(_:willRestoreState:)`;
  - restore retained peripherals, subscriptions, and pending connects into the native session runtime.
- Move live session ownership below Expo module lifetime:
  - use a native singleton/runtime, e.g. `VescBleRuntime.shared`, to own `ConnectionCoordinator`;
  - Expo module attaches/detaches event sinks only;
  - `OnDestroy` must not call `stopBoard()`;
  - explicit user `stopBoard()` remains the disconnect path.
- Persist telemetry samples natively during the ride. JS may be suspended while native continues.

### Limits

- `bluetooth-central` wakes the app for BLE events; it does not grant continuous arbitrary execution.
- VESC telemetry is request/response in this app. If iOS suspends all execution, native poll timers stop and the board will not send new telemetry replies.
- A peripheral-side heartbeat/streaming notification would be the cleanest BLE-native wake source, but it requires firmware/peripheral behavior we do not control.
- Background scanning is throttled and should be treated as reconnect assistance only.
- If the user force-quits the app, iOS may prevent background relaunch until the user opens the app again.
- `BGTaskScheduler`, silent push, or background fetch are not suitable for live ride telemetry.
- `audio` background mode should not be used as a silent keepalive hack; it risks App Store rejection unless the app has real user-facing audio.

### Why Float Control Can Likely Record Locked Rides

Float Control's App Store listing says it may use location even when not open. That points to the same viable model: real ride GPS tracking keeps the native process eligible for background execution, while BLE polling and ride recording happen inside native code.

### References

- Apple CoreBluetooth background processing: https://developer.apple.com/library/archive/documentation/NetworkingInternetWeb/Conceptual/CoreBluetooth_concepts/CoreBluetoothBackgroundProcessingForIOSApps/PerformingTasksWhileYourAppIsInTheBackground.html
- Apple background execution modes: https://developer.apple.com/documentation/xcode/configuring-background-execution-modes
- Punch Through background BLE/state restoration notes: https://punchthrough.com/leveraging-background-bluetooth-for-a-great-user-experience/
