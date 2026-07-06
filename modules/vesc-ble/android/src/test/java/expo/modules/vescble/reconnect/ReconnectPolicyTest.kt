package expo.modules.vescble.reconnect

import org.junit.Assert.assertEquals
import org.junit.Test

class ReconnectPolicyTest {
    @Test
    fun `backoff grows linearly then caps`() {
        assertEquals(ReconnectRetry(attempt = 1, delayMs = 500L), ReconnectPolicy.nextRetry(0))
        assertEquals(ReconnectRetry(attempt = 2, delayMs = 1_000L), ReconnectPolicy.nextRetry(1))
        assertEquals(ReconnectRetry(attempt = 10, delayMs = 5_000L), ReconnectPolicy.nextRetry(9))
        assertEquals(ReconnectRetry(attempt = 60, delayMs = 5_000L), ReconnectPolicy.nextRetry(59))
    }

    @Test
    fun `retries stay capped and never give up`() {
        assertEquals(ReconnectRetry(attempt = 61, delayMs = 5_000L), ReconnectPolicy.nextRetry(60))
        assertEquals(ReconnectRetry(attempt = 1_000, delayMs = 5_000L), ReconnectPolicy.nextRetry(999))
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
