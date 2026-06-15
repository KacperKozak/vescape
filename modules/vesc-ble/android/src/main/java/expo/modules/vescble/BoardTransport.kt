package expo.modules.vescble

internal interface BoardTransport {
    fun frame(cmd: ByteArray): ByteArray
}

internal object DirectTransport : BoardTransport {
    override fun frame(cmd: ByteArray): ByteArray = cmd
}

internal class CanForwardTransport(private val canId: Int) : BoardTransport {
    init {
        require(canId in 0..255) { "canId must fit uint8" }
    }

    override fun frame(cmd: ByteArray): ByteArray =
        byteArrayOf(COMM_FORWARD_CAN.toByte(), canId.toByte()) + cmd
}

internal fun boardTransport(canId: Int?, directConnection: Boolean): BoardTransport? =
    when {
        canId != null -> CanForwardTransport(canId)
        directConnection -> DirectTransport
        else -> null
    }
