package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SocMedianWindowTest {

    @Test
    fun `single sample returns itself`() {
        val w = SocMedianWindow(windowMs = 20_000L)
        assertEquals(54.0, w.median(54.0, 0L), 0.001)
    }

    @Test
    fun `quantizes to tenth percent buckets`() {
        val w = SocMedianWindow(windowMs = 20_000L)
        assertEquals(54.1, w.median(54.06, 0L), 0.001)
    }

    @Test
    fun `odd count returns middle value`() {
        val w = SocMedianWindow(windowMs = 20_000L)
        w.median(50.0, 0L)
        w.median(90.0, 1_000L)
        // sorted [50, 55, 90] -> 55
        assertEquals(55.0, w.median(55.0, 2_000L), 0.001)
    }

    @Test
    fun `even count averages the two middle values`() {
        val w = SocMedianWindow(windowMs = 20_000L)
        w.median(50.0, 0L)
        w.median(52.0, 1_000L)
        w.median(58.0, 2_000L)
        // sorted [50, 52, 58, 90] -> (52 + 58) / 2 = 55
        assertEquals(55.0, w.median(90.0, 3_000L), 0.001)
    }

    @Test
    fun `single-sample spike is rejected by the median`() {
        val w = SocMedianWindow(windowMs = 20_000L)
        w.median(54.0, 0L)
        w.median(53.0, 1_000L)
        // sorted [48, 53, 54] -> median 53; the lone 5% sag dip is ignored
        assertEquals(53.0, w.median(48.0, 2_000L), 0.001)
    }

    @Test
    fun `drops samples older than the window`() {
        val w = SocMedianWindow(windowMs = 5_000L)
        w.median(0.0, 0L) // expires before 7_000
        w.median(100.0, 6_000L)
        // window holds [100, 50] -> median 75
        assertEquals(75.0, w.median(50.0, 7_000L), 0.001)
    }

    @Test
    fun `zero window disables smoothing`() {
        val w = SocMedianWindow(windowMs = 0L)
        w.median(50.0, 0L)
        assertEquals(90.0, w.median(90.0, 1_000L), 0.001)
    }

    @Test
    fun `reset clears the window`() {
        val w = SocMedianWindow(windowMs = 20_000L)
        w.median(10.0, 0L)
        w.median(10.0, 1_000L)
        w.reset()
        assertEquals(80.0, w.median(80.0, 2_000L), 0.001)
    }

    @Test
    fun `damps oscillation so it stays below the re-arm threshold`() {
        // Pack resting ~54%, responsive % swings 50..60 with load.
        val w = SocMedianWindow(windowMs = 20_000L)
        val swing = listOf(54.0, 60.0, 50.0, 58.0, 51.0, 59.0, 52.0, 57.0, 53.0, 56.0)
        var t = 0L
        var max = Double.MIN_VALUE
        for (p in swing) {
            max = maxOf(max, w.median(p, t))
            t += 500L
        }
        assertTrue("median flapped above re-arm threshold: $max", max < 58.0)
    }
}
