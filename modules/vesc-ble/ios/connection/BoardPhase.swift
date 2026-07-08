import Foundation

/// Rider-facing Board Session phase. Mirrors the Android `BoardPhase` wire contract the JS
/// layer depends on: `idle → connecting → discovering → subscribing → waiting_for_telemetry →
/// connected`, plus the mid-ride reconnect states `reconnecting → rescanning` (#58).
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/BoardPhase.kt
/// @platform-diff Android also exposes `stale` and `disconnecting`. iOS immediately routes stale
/// telemetry through `reconnecting`, and explicit stop transitions directly to `idle`/`error`
/// because there is no foreground-service teardown window to surface.
internal enum BoardPhase: String {
  case idle
  case connecting
  case discovering
  case subscribing
  case waitingForTelemetry = "waiting_for_telemetry"
  case connected
  case reconnecting
  case rescanning
  case error
}
