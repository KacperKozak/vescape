package expo.modules.vescble

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TelemetryRecordingThrottleTest {

    @Test
    fun `records first sample immediately`() {
        val throttle = TelemetryRecordingThrottle()

        assertTrue(throttle.shouldRecord(0L))
    }

    @Test
    fun `throttles samples until interval elapses`() {
        val throttle = TelemetryRecordingThrottle(intervalMs = 100L)

        assertTrue(throttle.shouldRecord(1_000L))
        assertFalse(throttle.shouldRecord(1_099L))
        assertTrue(throttle.shouldRecord(1_100L))
    }

    @Test
    fun `reset allows next sample immediately`() {
        val throttle = TelemetryRecordingThrottle(intervalMs = 100L)

        assertTrue(throttle.shouldRecord(1_000L))
        assertFalse(throttle.shouldRecord(1_050L))
        throttle.reset()

        assertTrue(throttle.shouldRecord(1_050L))
    }
}
