package expo.modules.vescble.reconnect

internal data class ReconnectScanMatch(
    val address: String,
    val rssi: Int?,
)

internal interface ReconnectBlePort {
    fun hasScanner(): Boolean

    fun startScan(
        targetId: String,
        onFound: (ReconnectScanMatch) -> Unit,
        onFailed: (errorCode: Int) -> Unit,
    ): Boolean

    fun stopScan()
}
