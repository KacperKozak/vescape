package expo.modules.vescble.telemetry

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class IdlePauseDetectorTest {

  private val threshold = 300 // 3 km/h in centi-km/h, the default moving threshold

  @Test
  fun `does not pause before the idle window elapses`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    assertNull(d.onSample(0, threshold, 0L))
    assertNull(d.onSample(0, threshold, 29_999L))
    assertFalse(d.isPaused)
  }

  @Test
  fun `pauses after continuous non-moving time reaches the window`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    assertEquals(IdlePauseTransition.Paused, d.onSample(50, threshold, 30_000L))
    assertTrue(d.isPaused)
  }

  @Test
  fun `a moving sample mid-window resets the idle timer`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    d.onSample(500, threshold, 20_000L) // moving -> resets
    assertNull(d.onSample(0, threshold, 45_000L)) // only 25s of idle since reset
    assertFalse(d.isPaused)
  }

  @Test
  fun `speed at exactly the threshold counts as moving`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    assertNull(d.onSample(threshold, threshold, 30_000L))
    assertFalse(d.isPaused)
  }

  @Test
  fun `resumes instantly on first moving sample after pause`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    d.onSample(0, threshold, 30_000L) // pause
    assertEquals(IdlePauseTransition.Resumed, d.onSample(400, threshold, 60_000L))
    assertFalse(d.isPaused)
  }

  @Test
  fun `stays paused while still non-moving and emits no repeat transition`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    d.onSample(0, threshold, 30_000L) // pause
    assertNull(d.onSample(0, threshold, 31_000L))
    assertNull(d.onSample(0, threshold, 120_000L))
    assertTrue(d.isPaused)
  }

  @Test
  fun `negative speed beyond threshold counts as moving`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    assertNull(d.onSample(-500, threshold, 30_000L))
    assertFalse(d.isPaused)
  }

  @Test
  fun `re-pauses after a resume`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    d.onSample(0, threshold, 30_000L) // pause
    d.onSample(400, threshold, 31_000L) // resume
    d.onSample(0, threshold, 31_000L)
    assertEquals(IdlePauseTransition.Paused, d.onSample(0, threshold, 61_000L))
  }

  @Test
  fun `reset clears pause and timer`() {
    val d = IdlePauseDetector(pauseAfterMs = 30_000L)
    d.onSample(0, threshold, 0L)
    d.onSample(0, threshold, 30_000L) // pause
    d.reset()
    assertFalse(d.isPaused)
    assertNull(d.onSample(0, threshold, 31_000L)) // timer restarted from here
  }
}
