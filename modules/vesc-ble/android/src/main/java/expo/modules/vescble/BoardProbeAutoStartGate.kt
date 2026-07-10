package expo.modules.vescble

/**
 * In-process guard while Board Probe owns BLE. Native auto-start sources
 * (auto-connect and companion presence) must not create a Board Session during
 * probe handshake, or they race the detector for the single GATT link.
 */
internal object BoardProbeAutoStartGate {
    private var activeProbeCount = 0

    @Synchronized
    fun enter() {
        activeProbeCount += 1
    }

    @Synchronized
    fun leave() {
        activeProbeCount = (activeProbeCount - 1).coerceAtLeast(0)
    }

    @Synchronized
    fun isActive(): Boolean = activeProbeCount > 0
}
