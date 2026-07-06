package expo.modules.vescble.runtime

// @parity /modules/vesc-ble/ios/runtime/BoardSession.swift
class BoardSession(val id: Long) {
    @Volatile
    var isActive: Boolean = true
        private set

    fun invalidate() {
        isActive = false
    }
}
