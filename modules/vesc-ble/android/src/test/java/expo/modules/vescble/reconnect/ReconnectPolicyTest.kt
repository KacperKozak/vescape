package expo.modules.vescble.reconnect

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconnectPolicyTest {
    @Test
    fun `backoff grows linearly then caps`() {
        assertEquals(ReconnectDecision.Retry(attempt = 1, delayMs = 500L), ReconnectPolicy.nextDecision(0))
        assertEquals(ReconnectDecision.Retry(attempt = 2, delayMs = 1_000L), ReconnectPolicy.nextDecision(1))
        assertEquals(ReconnectDecision.Retry(attempt = 10, delayMs = 5_000L), ReconnectPolicy.nextDecision(9))
        assertEquals(ReconnectDecision.Retry(attempt = 60, delayMs = 5_000L), ReconnectPolicy.nextDecision(59))
    }

    @Test
    fun `max attempts gives up`() {
        assertTrue(ReconnectPolicy.nextDecision(60) is ReconnectDecision.GiveUp)
    }

    @Test
    fun `board ready timeout follows reconnect attempt and caps`() {
        assertEquals(4_000L, ReconnectPolicy.boardReadyTimeoutMs(0))
        assertEquals(6_000L, ReconnectPolicy.boardReadyTimeoutMs(1))
        assertEquals(14_000L, ReconnectPolicy.boardReadyTimeoutMs(5))
        assertEquals(15_000L, ReconnectPolicy.boardReadyTimeoutMs(6))
        assertEquals(15_000L, ReconnectPolicy.boardReadyTimeoutMs(100))
    }
}
