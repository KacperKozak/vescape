package expo.modules.vescble

import expo.modules.vescble.runtime.TestScheduler
import kotlin.math.roundToInt
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemoteTiltControllerTest {
  private val scheduler = TestScheduler()
  private val sent = mutableListOf<ByteArray>()
  private var transport: BoardTransport? = BoardTransport.Direct

  private fun controller() =
    RemoteTiltController(
      scheduler = scheduler,
      transport = { transport },
      send = { payload, _ -> sent.add(payload); true },
    )

  private fun tilt(value: Int) = buildRemoteTiltCommand(BoardTransport.Direct, value)

  /** Mirrors the controller's linear ease so expectations track the formula. */
  private fun decayValue(from: Int, steps: Int, tick: Int): Int =
    if (tick >= steps) REMOTE_TILT_CENTER
    else (from + (REMOTE_TILT_CENTER - from) * (tick.toDouble() / steps)).roundToInt()

  @Test
  fun holdSendsImmediatelyThenRepeatsLatestValue() {
    val controller = controller()

    assertTrue(controller.hold(200))
    assertEquals(1, sent.size)
    assertArrayEquals(tilt(200), sent[0])

    scheduler.advance(40)
    assertEquals(2, sent.size)
    assertArrayEquals(tilt(200), sent[1])
  }

  @Test
  fun rapidHoldUpdatesCoalesceToLatestWithoutFloodingWrites() {
    val controller = controller()

    controller.hold(140) // first press sends immediately
    controller.hold(160) // already streaming: swap value only, no extra write
    controller.hold(200) // already streaming: swap value only, no extra write
    assertEquals(1, sent.size)

    scheduler.advance(40) // a single repeat tick emits just the latest value
    assertEquals(2, sent.size)
    assertArrayEquals(tilt(200), sent[1])
  }

  @Test
  fun releaseEasesLinearlyToNeutralThenStops() {
    val controller = controller()
    val from = 255
    val steps = 10 // 400ms / 40ms

    assertTrue(controller.release(from, 400))
    assertArrayEquals(tilt(from), sent[0]) // immediate from-value

    scheduler.advance(400)
    // ticks 1..10 emitted; mid-ramp value is interpolated, last lands on neutral.
    assertArrayEquals(tilt(decayValue(from, steps, 1)), sent[1])
    assertArrayEquals(tilt(REMOTE_TILT_CENTER), sent.last())
    assertEquals(11, sent.size)

    scheduler.advance(200)
    assertEquals(11, sent.size) // stream ended; no further repeats
  }

  @Test
  fun holdThenReleaseEasesFromHeldValue() {
    val controller = controller()
    controller.hold(255) // live drag streams immediately
    assertEquals(1, sent.size)

    controller.release(255, 400) // hands off to decay without an extra write
    assertEquals(1, sent.size)

    scheduler.advance(400)
    assertArrayEquals(tilt(REMOTE_TILT_CENTER), sent.last())
  }

  @Test
  fun releaseWithSubTickDurationSnapsToNeutral() {
    val controller = controller()
    controller.hold(200)
    sent.clear()

    assertTrue(controller.release(200, 20)) // < one 40ms tick
    assertEquals(1, sent.size)
    assertArrayEquals(tilt(REMOTE_TILT_CENTER), sent[0])

    scheduler.advance(200)
    assertEquals(1, sent.size) // no decay ticks
  }

  @Test
  fun stopSnapsToNeutralAndCancelsRepeat() {
    val controller = controller()
    controller.hold(200)
    sent.clear()

    assertTrue(controller.stop())
    assertEquals(1, sent.size)
    assertArrayEquals(tilt(REMOTE_TILT_CENTER), sent[0])

    scheduler.advance(200)
    assertEquals(1, sent.size) // no further repeats after stop
  }

  @Test
  fun exposesCommandedValueAndLockState() {
    val controller = controller()
    assertEquals(REMOTE_TILT_CENTER, controller.currentValue)
    assertFalse(controller.isLocked)

    controller.lock(200)
    assertEquals(200, controller.currentValue)
    assertTrue(controller.isLocked)

    // A live drag (hold) clears the lock but keeps reporting the held value.
    controller.hold(160)
    assertEquals(160, controller.currentValue)
    assertFalse(controller.isLocked)

    // Re-lock, then release: lock clears and the value tracks the ease.
    controller.lock(255)
    assertTrue(controller.isLocked)
    controller.release(255, 400)
    assertFalse(controller.isLocked)
    scheduler.advance(200) // mid-ease
    assertTrue(controller.currentValue in REMOTE_TILT_CENTER until 255)

    scheduler.advance(400) // ease completes
    assertEquals(REMOTE_TILT_CENTER, controller.currentValue)
    assertFalse(controller.isLocked)
  }

  @Test
  fun stopClearsLockState() {
    val controller = controller()
    controller.lock(200)
    assertTrue(controller.isLocked)

    controller.stop()
    assertFalse(controller.isLocked)
    assertEquals(REMOTE_TILT_CENTER, controller.currentValue)
  }

  @Test
  fun holdReturnsFalseWhenNotStreamable() {
    transport = null
    val controller = controller()

    assertFalse(controller.hold(200))
    assertEquals(0, sent.size)
  }

  @Test
  fun repeatStopsWhenTransportIsLost() {
    val controller = controller()
    controller.hold(200)
    sent.clear()

    transport = null
    scheduler.advance(40) // repeat fires, sees no transport, stops the loop
    assertEquals(0, sent.size)

    transport = BoardTransport.Direct
    scheduler.advance(200) // loop stayed stopped; nothing resurrects it
    assertEquals(0, sent.size)
  }
}
