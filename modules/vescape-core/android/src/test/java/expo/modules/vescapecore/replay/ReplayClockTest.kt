package expo.modules.vescapecore.replay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private const val WARMUP_MS = 180_000L

class ReplayClockTest {

    @Test
    fun `starts a full warmup window in the past`() {
        val clock = ReplayClock(WARMUP_MS)

        val behindMs = System.currentTimeMillis() - clock.nowMs()

        assertTrue("expected ~${WARMUP_MS}ms behind, was $behindMs", behindMs in WARMUP_MS - 500..WARMUP_MS + 500)
    }

    /**
     * The point of the whole design: a warmup dispatched in an instant still has to stamp its
     * samples across the window they actually cover, or the live charts stay empty.
     */
    @Test
    fun `spreads an instant warmup across the recorded window`() {
        val clock = ReplayClock(WARMUP_MS)
        val playbackStartedAt = System.currentTimeMillis()

        clock.advanceWarmup(recordedT = 0L, playbackStartedAt = playbackStartedAt)
        val first = clock.nowMs()
        clock.advanceWarmup(recordedT = WARMUP_MS / 2, playbackStartedAt = playbackStartedAt)
        val middle = clock.nowMs()

        assertEquals((playbackStartedAt - WARMUP_MS).toDouble(), first.toDouble(), 500.0)
        assertEquals((playbackStartedAt - WARMUP_MS / 2).toDouble(), middle.toDouble(), 500.0)
    }

    @Test
    fun `holds its offset once the warmup stops advancing it`() {
        val clock = ReplayClock(WARMUP_MS)
        val playbackStartedAt = System.currentTimeMillis()
        clock.advanceWarmup(recordedT = WARMUP_MS, playbackStartedAt = playbackStartedAt)

        val offsetAfterWarmup = clock.nowMs() - System.currentTimeMillis()
        Thread.sleep(30L)
        val offsetLater = clock.nowMs() - System.currentTimeMillis()

        // Frozen offset means the session clock now advances at exactly wall-clock rate, which is
        // what keeps the rest of playback running at 1x.
        assertEquals(offsetAfterWarmup.toDouble(), offsetLater.toDouble(), 20.0)
    }

    @Test
    fun `never steps backwards when the warmup falls behind real time`() {
        val clock = ReplayClock(WARMUP_MS)
        val playbackStartedAt = System.currentTimeMillis()
        clock.advanceWarmup(recordedT = WARMUP_MS / 2, playbackStartedAt = playbackStartedAt)
        val ahead = clock.nowMs()

        // A warmup slower than real time would pull the offset back; the clamp has to absorb it.
        clock.advanceWarmup(recordedT = 0L, playbackStartedAt = playbackStartedAt)

        assertTrue(clock.nowMs() >= ahead)
    }
}
