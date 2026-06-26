package expo.modules.vescble

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.TestScheduler
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Verifies the dedicated watch tick fires at its configured cadence and re-arms live when the
 * `wearMirrorIntervalMs` App Setting changes (ADR-0013/0019) — lowering the interval must take
 * effect immediately rather than waiting out the current, longer delay.
 */
class WatchTickTest {

    private val snapshot = WatchSnapshot(
        speed = 10.0,
        dutyCycle = 0.5,
        dutyExcluded = false,
        batterySoc = 80.0,
        motorTemp = 40.0,
        ctrlTemp = 35.0,
    )

    private fun tick(
        scheduler: TestScheduler,
        session: BoardSession,
        intervalMs: Long,
        onPush: () -> Unit,
    ) = WatchTick(
        scheduler = scheduler,
        session = { session },
        isCurrentSession = { it === session },
        snapshot = { snapshot },
        isStale = { false },
        canPush = { true },
        push = { onPush() },
        intervalMs = intervalMs,
    )

    @Test
    fun `pushes a frame every interval`() {
        val scheduler = TestScheduler()
        val session = BoardSession(1)
        var pushes = 0
        tick(scheduler, session, 500) { pushes++ }.start()

        scheduler.advance(1500)

        assertEquals(3, pushes)
    }

    @Test
    fun `lowering interval re-arms the pending tick immediately`() {
        val scheduler = TestScheduler()
        val session = BoardSession(1)
        var pushes = 0
        val watchTick = tick(scheduler, session, 2000) { pushes++ }
        watchTick.start()

        scheduler.advance(1000)
        assertEquals(0, pushes)

        // Pending 2s tick is cancelled and rescheduled at the new 100ms cadence.
        watchTick.setIntervalMs(100)
        scheduler.advance(100)
        assertEquals(1, pushes)

        scheduler.advance(300)
        assertEquals(4, pushes)
    }

    @Test
    fun `setIntervalMs while stopped takes effect on next start`() {
        val scheduler = TestScheduler()
        val session = BoardSession(1)
        var pushes = 0
        val watchTick = tick(scheduler, session, 500) { pushes++ }

        watchTick.setIntervalMs(100)
        watchTick.start()
        scheduler.advance(300)

        assertEquals(3, pushes)
    }
}
