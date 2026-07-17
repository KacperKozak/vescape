package expo.modules.vescble.warnings

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Payload rounding parity: `boardWarningRound4` must round ties half away from zero on both
 * platforms so the same detector input serializes to the same wire value.
 * @parity /modules/vesc-ble/ios/telemetry/BoardWarningPayloadTests.swift
 */
class BoardWarningKindTest {
  @Test
  fun round4RoundsTiesAwayFromZero() {
    assertEquals(0.1235, boardWarningRound4(0.12345), 0.0)
    assertEquals(-0.1235, boardWarningRound4(-0.12345), 0.0)
  }

  @Test
  fun round4StripsFloatNoise() {
    assertEquals(0.12, boardWarningRound4(3.92 - 3.80), 0.0)
    assertEquals(-0.12, boardWarningRound4(3.80 - 3.92), 0.0)
  }
}
