package expo.modules.vescble.notification

import expo.modules.vescble.BoardPhase
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationUpdateGateTest {
    @Test
    fun `throttles repeated connected telemetry posts`() {
        val gate = NotificationUpdateGate(minIntervalMs = 10_000L)

        assertTrue(gate.shouldPost(BoardPhase.Connected, nowMs = 1_000L))
        assertFalse(gate.shouldPost(BoardPhase.Connected, nowMs = 1_500L))
        assertTrue(gate.shouldPost(BoardPhase.Connected, nowMs = 11_000L))
    }

    @Test
    fun `posts phase changes immediately`() {
        val gate = NotificationUpdateGate(minIntervalMs = 10_000L)

        assertTrue(gate.shouldPost(BoardPhase.Connected, nowMs = 1_000L))
        assertTrue(gate.shouldPost(BoardPhase.Reconnecting, nowMs = 1_500L))
        assertFalse(gate.shouldPost(BoardPhase.Reconnecting, nowMs = 2_000L))
    }

    @Test
    fun `force bypasses interval for same phase updates`() {
        val gate = NotificationUpdateGate(minIntervalMs = 10_000L)

        assertTrue(gate.shouldPost(BoardPhase.Connected, nowMs = 1_000L))
        assertTrue(gate.shouldPost(BoardPhase.Connected, nowMs = 1_500L, force = true))
    }
}
