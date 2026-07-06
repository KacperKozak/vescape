import Foundation

/// Identity token for one Board Session. Long-lived native work (GATT callbacks, poll
/// timers) captures the session it started under and checks `isActive` before touching
/// shared state, so a callback from a torn-down or reconnected session is discarded
/// instead of clobbering the live one. See ADR 0010.
///
/// @parity /modules/vesc-ble/android/src/main/java/expo/modules/vescble/runtime/BoardSession.kt
final class BoardSession {
  let id: Int64
  private(set) var isActive = true

  init(id: Int64) {
    self.id = id
  }

  func invalidate() {
    isActive = false
  }
}
