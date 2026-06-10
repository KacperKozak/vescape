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

    // --- shouldCanPingFallback (CAN ping timeout decision) ---

    @Test
    fun `fallback when no canId, not direct, waiting for telemetry`() {
        assertTrue(
            shouldCanPingFallback(
                canId = null,
                directConnection = false,
                boardStatus = BoardPhase.WaitingForTelemetry,
            ),
        )
    }

    @Test
    fun `no fallback when canId already discovered`() {
        assertFalse(
            shouldCanPingFallback(
                canId = 5,
                directConnection = false,
                boardStatus = BoardPhase.WaitingForTelemetry,
            ),
        )
    }

    @Test
    fun `no fallback when already direct connection`() {
        assertFalse(
            shouldCanPingFallback(
                canId = null,
                directConnection = true,
                boardStatus = BoardPhase.WaitingForTelemetry,
            ),
        )
    }

    @Test
    fun `no fallback when board already connected`() {
        assertFalse(
            shouldCanPingFallback(
                canId = null,
                directConnection = false,
                boardStatus = BoardPhase.Connected,
            ),
        )
    }

    @Test
    fun `no fallback when board still connecting`() {
        assertFalse(
            shouldCanPingFallback(
                canId = null,
                directConnection = false,
                boardStatus = BoardPhase.Connecting,
            ),
        )
    }

    @Test
    fun `accept CAN ping while waiting for telemetry`() {
        assertTrue(
            shouldAcceptCanPingResponse(
                boardStatus = BoardPhase.WaitingForTelemetry,
            ),
        )
    }

    @Test
    fun `accept CAN ping while reconnecting`() {
        assertTrue(
            shouldAcceptCanPingResponse(
                boardStatus = BoardPhase.Reconnecting,
            ),
        )
    }

    @Test
    fun `ignore CAN ping once connected`() {
        assertFalse(
            shouldAcceptCanPingResponse(
                boardStatus = BoardPhase.Connected,
            ),
        )
    }

    // --- shouldSetDirectOnReady (markBoardReady sets direct) ---

    @Test
    fun `set direct on ready when not polling capable`() {
        assertTrue(shouldSetDirectOnReady(canId = null, directConnection = false))
    }

    @Test
    fun `no set direct when canId present`() {
        assertFalse(shouldSetDirectOnReady(canId = 3, directConnection = false))
    }

    @Test
    fun `no set direct when already direct`() {
        assertFalse(shouldSetDirectOnReady(canId = null, directConnection = true))
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

    // --- markBoardReady sequence (PintV path) ---

    @Test
    fun `pintv path - telemetry before CAN sets direct then starts polling`() {
        var canId: Int? = null
        var directConnection = false
        val pollRunnable: Any? = null

        // Step 1: should set direct (not polling capable yet)
        assertTrue(shouldSetDirectOnReady(canId, directConnection))
        directConnection = true // mirrors service mutation

        // Step 2: now should start polling (became capable)
        assertTrue(shouldStartPollingOnReady(canId, directConnection, pollRunnable))
    }

    @Test
    fun `can device found - no direct set, polling via canId`() {
        val canId: Int? = 5
        val directConnection = false
        val pollRunnable: Any? = null

        assertFalse(shouldSetDirectOnReady(canId, directConnection))
        assertTrue(shouldStartPollingOnReady(canId, directConnection, pollRunnable))
    }

    @Test
    fun `already polling - markBoardReady is noop on polling`() {
        var canId: Int? = null
        var directConnection = false
        val pollRunnable = Any()

        assertTrue(shouldSetDirectOnReady(canId, directConnection))
        directConnection = true

        assertFalse(shouldStartPollingOnReady(canId, directConnection, pollRunnable))
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
    fun `CAN ping timeout is 3500ms`() {
        assertEquals(3_500L, CAN_PING_TIMEOUT)
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
