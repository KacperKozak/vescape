package expo.modules.vescble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VescWriteQueueTest {
    @Test
    fun neutralRemoteTiltReplacesStaleTiltAndPreemptsNormalTraffic() {
        val queue = VescWriteQueue()
        val inFlightPoll = byteArrayOf(1)
        val queuedPoll = byteArrayOf(2)
        val staleTilt = byteArrayOf(3)
        val neutralTilt = byteArrayOf(4)

        queue.enqueueNormal(inFlightPoll)
        assertArrayEquals(inFlightPoll, queue.startNext()!!.bytes)
        queue.enqueueNormal(queuedPoll)
        queue.replaceRemoteTilt(staleTilt)
        queue.replaceRemoteTilt(neutralTilt, urgent = true)

        queue.completeInFlight()
        val next = queue.startNext()
        assertEquals(VescWriteQueue.Write.RemoteTilt::class, next!!::class)
        assertArrayEquals(neutralTilt, next.bytes)

        queue.completeInFlight()
        assertArrayEquals(queuedPoll, queue.startNext()!!.bytes)
    }

    @Test
    fun onlyOneRemoteTiltWriteCanWaitBehindInFlightWrite() {
        val queue = VescWriteQueue()
        val first = byteArrayOf(1)
        val latest = byteArrayOf(2)

        queue.replaceRemoteTilt(first)
        assertArrayEquals(first, queue.startNext()!!.bytes)
        queue.replaceRemoteTilt(latest)
        assertNull(queue.startNext())

        queue.completeInFlight()
        assertArrayEquals(latest, queue.startNext()!!.bytes)
        queue.completeInFlight()
        assertNull(queue.startNext())
    }

    @Test
    fun ordinaryRemoteTiltAndNormalTrafficAlternate() {
        val queue = VescWriteQueue()
        val firstTilt = byteArrayOf(1)
        val poll = byteArrayOf(2)
        val nextTilt = byteArrayOf(3)

        queue.replaceRemoteTilt(firstTilt)
        assertArrayEquals(firstTilt, queue.startNext()!!.bytes)
        queue.completeInFlight()
        queue.enqueueNormal(poll)
        queue.replaceRemoteTilt(nextTilt)

        assertArrayEquals(poll, queue.startNext()!!.bytes)
        queue.completeInFlight()
        assertArrayEquals(nextTilt, queue.startNext()!!.bytes)
    }

    @Test
    fun urgentNeutralTiltPreemptsNormalTraffic() {
        val queue = VescWriteQueue()
        val heldTilt = byteArrayOf(1)
        val poll = byteArrayOf(2)
        val neutralTilt = byteArrayOf(3)

        queue.replaceRemoteTilt(heldTilt)
        assertArrayEquals(heldTilt, queue.startNext()!!.bytes)
        queue.completeInFlight()
        queue.enqueueNormal(poll)
        queue.replaceRemoteTilt(neutralTilt, urgent = true)

        assertArrayEquals(neutralTilt, queue.startNext()!!.bytes)
    }

    @Test
    fun refusedRemoteTiltWriteNeverOverwritesNewerTilt() {
        val queue = VescWriteQueue()
        val refused = byteArrayOf(1)
        val latest = byteArrayOf(2)

        queue.replaceRemoteTilt(refused)
        assertArrayEquals(refused, queue.startNext()!!.bytes)
        queue.replaceRemoteTilt(latest)
        queue.retryInFlight()

        assertArrayEquals(latest, queue.startNext()!!.bytes)
    }
}
