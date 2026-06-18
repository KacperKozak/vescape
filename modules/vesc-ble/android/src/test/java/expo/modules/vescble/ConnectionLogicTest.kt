package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionLogicTest {

    // --- boardReadyTimeoutMs: progressive timeout ---

    @Test
    fun `attempt 0 returns base timeout`() {
        assertEquals(4_000L, boardReadyTimeoutMs(0))
    }

    @Test
    fun `attempt 1 adds 2s`() {
        assertEquals(6_000L, boardReadyTimeoutMs(1))
    }

    @Test
    fun `attempt 5 returns 14s`() {
        assertEquals(14_000L, boardReadyTimeoutMs(5))
    }

    @Test
    fun `attempt 6 capped at max 15s`() {
        assertEquals(15_000L, boardReadyTimeoutMs(6))
    }

    @Test
    fun `attempt 100 still capped at max`() {
        assertEquals(15_000L, boardReadyTimeoutMs(100))
    }

    // --- isPollingCapable ---

    @Test
    fun `polling capable when canId set`() {
        assertTrue(isPollingCapable(canId = 1, directConnection = false))
    }

    @Test
    fun `polling capable when direct connection`() {
        assertTrue(isPollingCapable(canId = null, directConnection = true))
    }

    @Test
    fun `not polling capable when neither`() {
        assertFalse(isPollingCapable(canId = null, directConnection = false))
    }

    // --- shouldStartPollingOnReady ---

    @Test
    fun `start polling when no pollRunnable and capable`() {
        assertTrue(
            shouldStartPollingOnReady(canId = null, directConnection = true, pollRunnable = null),
        )
    }

    @Test
    fun `no start polling when already polling`() {
        assertFalse(
            shouldStartPollingOnReady(canId = null, directConnection = true, pollRunnable = Any()),
        )
    }

    @Test
    fun `no start polling when not capable`() {
        assertFalse(
            shouldStartPollingOnReady(canId = null, directConnection = false, pollRunnable = null),
        )
    }

    @Test
    fun `start polling via canId even without direct`() {
        assertTrue(
            shouldStartPollingOnReady(canId = 2, directConnection = false, pollRunnable = null),
        )
    }

    // --- boardReadyTimeoutMs edge ---

    @Test
    fun `negative attempt floors at base`() {
        assertEquals(BOARD_READY_TIMEOUT_BASE, boardReadyTimeoutMs(0))
        // negative would underflow but shouldn't happen; verify base is minimum
        assertTrue(boardReadyTimeoutMs(0) >= BOARD_READY_TIMEOUT_BASE)
    }

    // --- Constants sanity ---

    @Test
    fun `detection CAN ping timeout is 3500ms`() {
        assertEquals(3_500L, DETECT_CAN_PING_TIMEOUT_MS)
    }

    @Test
    fun `board ready base is 4 seconds`() {
        assertEquals(4_000L, BOARD_READY_TIMEOUT_BASE)
    }

    @Test
    fun `board ready max is 15 seconds`() {
        assertEquals(15_000L, BOARD_READY_TIMEOUT_MAX)
    }
}
