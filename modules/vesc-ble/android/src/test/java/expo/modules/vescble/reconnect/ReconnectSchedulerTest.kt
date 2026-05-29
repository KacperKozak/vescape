package expo.modules.vescble.reconnect

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.TestScheduler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReconnectSchedulerTest {
    @Test
    fun `attempt resets after connect success`() {
        val fixture = Fixture()
        fixture.reconnect.schedule(fixture.session, TARGET_ID, "board disconnected", 42)

        assertEquals(1, fixture.reconnect.currentAttempt)

        fixture.reconnect.resetAttempts()

        assertEquals(0, fixture.reconnect.currentAttempt)
    }

    @Test
    fun `scan timeout falls back to direct connect`() {
        val fixture = Fixture()
        fixture.reconnect.schedule(fixture.session, TARGET_ID, "board disconnected", null)

        fixture.scheduler.advance(250L)
        assertTrue(fixture.reconnect.isScanning)
        assertEquals(listOf("attempt:1", "scan_start"), fixture.listener.events)

        fixture.scheduler.advance(ReconnectPolicy.scanTimeoutMs())

        assertFalse(fixture.reconnect.isScanning)
        assertEquals(1, fixture.port.stopCount)
        assertEquals(listOf("scan_timeout"), fixture.listener.directReconnectReasons)
    }

    @Test
    fun `max attempts terminate without scheduling another scan`() {
        val fixture = Fixture(maxAttempts = 2)

        fixture.reconnect.schedule(fixture.session, TARGET_ID, "first", null)
        fixture.reconnect.schedule(fixture.session, TARGET_ID, "second", null)
        fixture.reconnect.schedule(fixture.session, TARGET_ID, "third", null)

        assertEquals(2, fixture.reconnect.currentAttempt)
        assertEquals(listOf("third"), fixture.listener.maxAttemptReasons)
        assertEquals(0, fixture.scheduler.pendingCount)
    }

    @Test
    fun `disconnect during scan cancels rescue`() {
        val fixture = Fixture()
        fixture.reconnect.schedule(fixture.session, TARGET_ID, "board disconnected", null)
        fixture.scheduler.advance(250L)

        fixture.reconnect.cancel()
        fixture.scheduler.advance(ReconnectPolicy.scanTimeoutMs())

        assertFalse(fixture.reconnect.isScanning)
        assertEquals(1, fixture.port.stopCount)
        assertTrue(fixture.listener.directReconnectReasons.isEmpty())
    }

    @Test
    fun `stale session does not launch scan`() {
        val fixture = Fixture()
        fixture.reconnect.schedule(fixture.session, TARGET_ID, "board disconnected", null)

        fixture.session.invalidate()
        fixture.scheduler.advance(250L)

        assertFalse(fixture.reconnect.isScanning)
        assertEquals(0, fixture.port.startCount)
    }

    private class Fixture(maxAttempts: Int = RECONNECT_MAX_ATTEMPTS) {
        val scheduler = TestScheduler()
        val port = FakeReconnectBlePort()
        val listener = FakeReconnectListener()
        val session = BoardSession(id = 1)
        val reconnect = ReconnectScheduler(
            scheduler = scheduler,
            port = port,
            listener = listener,
            maxAttempts = maxAttempts,
        )
    }

    private class FakeReconnectBlePort : ReconnectBlePort {
        var scannerAvailable = true
        var startCount = 0
        var stopCount = 0
        var onFound: ((ReconnectScanMatch) -> Unit)? = null
        var onFailed: ((Int) -> Unit)? = null

        override fun hasScanner(): Boolean = scannerAvailable

        override fun startScan(
            targetId: String,
            onFound: (ReconnectScanMatch) -> Unit,
            onFailed: (errorCode: Int) -> Unit,
        ): Boolean {
            startCount++
            this.onFound = onFound
            this.onFailed = onFailed
            return true
        }

        override fun stopScan() {
            stopCount++
        }
    }

    private class FakeReconnectListener : ReconnectListener {
        var active = true
        val events = mutableListOf<String>()
        val directReconnectReasons = mutableListOf<String>()
        val maxAttemptReasons = mutableListOf<String>()

        override fun isReconnectActive(session: BoardSession): Boolean = active

        override fun onAttempt(session: BoardSession, reason: String, gattStatus: Int?, nextAttempt: Int) {
            events.add("attempt:$nextAttempt")
        }

        override fun onScanStart(session: BoardSession) {
            events.add("scan_start")
        }

        override fun onScanFound(session: BoardSession, match: ReconnectScanMatch) {
            events.add("scan_found:${match.address}")
        }

        override fun onScanTimeout(session: BoardSession) {
            events.add("scan_timeout")
        }

        override fun onScanFailed(session: BoardSession, errorCode: Int) {
            events.add("scan_failed:$errorCode")
        }

        override fun onScanStartFailed(session: BoardSession, error: String?) {
            events.add("scan_start_failed")
        }

        override fun onMissingTarget(session: BoardSession) {
            events.add("missing_target")
        }

        override fun onScannerUnavailable(session: BoardSession) {
            events.add("scanner_unavailable")
        }

        override fun startDirectReconnect(session: BoardSession, reason: String) {
            directReconnectReasons.add(reason)
        }

        override fun onMaxAttemptsReached(session: BoardSession, reason: String) {
            maxAttemptReasons.add(reason)
        }
    }

    private companion object {
        const val TARGET_ID = "AA:BB:CC:DD:EE:FF"
    }
}
