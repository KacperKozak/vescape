package expo.modules.vescble

/**
 * Serializes BLE writes while keeping transient remote-tilt input replaceable.
 *
 * Normal commands preserve FIFO ordering. Remote tilt has at most one pending
 * command: a newer value replaces an older one. Ordinary remote commands and
 * normal traffic alternate when both are pending; emergency neutral always
 * dispatches first once the current write completes.
 */
internal class VescWriteQueue {
    sealed interface Write {
        val bytes: ByteArray

        data class Normal(override val bytes: ByteArray) : Write
        data class RemoteTilt(override val bytes: ByteArray) : Write
    }

    private val normal = ArrayDeque<ByteArray>()
    private data class RemoteTilt(val bytes: ByteArray, val urgent: Boolean)

    private var pendingRemoteTilt: RemoteTilt? = null
    private var inFlight: Write? = null
    private var preferRemoteTilt = false

    @Synchronized
    fun enqueueNormal(bytes: ByteArray) {
        normal.addLast(bytes)
    }

    /** Replace any unsent remote-tilt input with [bytes]. */
    @Synchronized
    fun replaceRemoteTilt(bytes: ByteArray, urgent: Boolean = false) {
        pendingRemoteTilt = RemoteTilt(bytes, urgent)
    }

    /** Start next write, or `null` while another write is active or queue is empty. */
    @Synchronized
    fun startNext(): Write? {
        if (inFlight != null) return null

        val remoteTilt = pendingRemoteTilt
        if (remoteTilt != null && (remoteTilt.urgent || normal.isEmpty() || preferRemoteTilt)) {
            pendingRemoteTilt = null
            preferRemoteTilt = false
            return Write.RemoteTilt(remoteTilt.bytes).also { inFlight = it }
        }

        val next = normal.removeFirstOrNull() ?: return null
        preferRemoteTilt = true
        return Write.Normal(next).also { inFlight = it }
    }

    /** Complete current write after its GATT callback. */
    @Synchronized
    fun completeInFlight(): Write? = inFlight.also { inFlight = null }

    /**
     * Put a write that Android refused to start back into the queue. A newer
     * remote-tilt value wins over the refused one.
     */
    @Synchronized
    fun retryInFlight() {
        when (val write = inFlight) {
            is Write.Normal -> normal.addFirst(write.bytes)
            is Write.RemoteTilt -> if (pendingRemoteTilt == null) {
                pendingRemoteTilt = RemoteTilt(write.bytes, urgent = false)
            }
            null -> Unit
        }
        inFlight = null
    }

    @Synchronized
    fun clear() {
        normal.clear()
        pendingRemoteTilt = null
        inFlight = null
        preferRemoteTilt = false
    }
}
