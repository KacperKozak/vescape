package expo.modules.vescble

import expo.modules.vescble.runtime.BoardSession
import expo.modules.vescble.runtime.TestScheduler
import org.junit.Assert.assertEquals
import org.junit.Test

class PollingLoopTest {
  @Test
  fun usesMode1ByDefaultAndMode2EverySecondForDirectConnection() {
    val scheduler = TestScheduler()
    val session = BoardSession(1L)
    val modes = mutableListOf<Int>()
    val loop = PollingLoop(
      scheduler = scheduler,
      isCurrentSession = { it === session },
      sendPayloadWithRetry = { payload, _ ->
        modes.add(payload.last().toInt())
        true
      },
    )

    loop.start(sessionConfig(pollIntervalMs = 100L), session, canId = null, directConnection = true)
    scheduler.advance(900L)

    assertEquals(listOf(1, 1, 1, 1, 1, 1, 1, 1, 1, 2), modes)
  }

  @Test
  fun adaptsMode2CadenceToPollInterval() {
    val scheduler = TestScheduler()
    val session = BoardSession(1L)
    val modes = mutableListOf<Int>()
    val loop = PollingLoop(
      scheduler = scheduler,
      isCurrentSession = { it === session },
      sendPayloadWithRetry = { payload, _ ->
        modes.add(payload.last().toInt())
        true
      },
    )

    loop.start(sessionConfig(pollIntervalMs = 50L), session, canId = 7, directConnection = false)
    scheduler.advance(950L)

    assertEquals(20, modes.size)
    assertEquals(2, modes.last())
    assertEquals(19, modes.count { it == 1 })
  }

  private fun sessionConfig(pollIntervalMs: Long): SessionConfig = SessionConfig(
    appBoardId = "board-1",
    deviceId = "ble-1",
    deviceName = "Board",
    canId = null,
    pollIntervalMs = pollIntervalMs,
    recordingEnabled = false,
    telemetryRecordingEnabled = false,
  )
}
