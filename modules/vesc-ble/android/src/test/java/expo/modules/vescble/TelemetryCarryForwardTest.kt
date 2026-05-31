package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TelemetryCarryForwardTest {
  @Test
  fun patchesMissingTemperatureAndOdometerFromLatestCompleteSample() {
    val carryForward = TelemetryCarryForward()
    val complete = telemetry(tempMotor = 52.5, tempMosfet = 44.0, odometer = 123.0)
    val compact = telemetry(tempMotor = null, tempMosfet = null, odometer = null)

    carryForward.updateAndPatch(complete)
    val patched = carryForward.updateAndPatch(compact)

    assertEquals(52.5, patched.tempMotor!!, 0.001)
    assertEquals(44.0, patched.tempMosfet!!, 0.001)
    assertEquals(123.0, patched.odometer!!, 0.001)
  }

  @Test
  fun resetClearsCarriedValues() {
    val carryForward = TelemetryCarryForward()
    carryForward.updateAndPatch(telemetry(tempMotor = 52.5, tempMosfet = 44.0, odometer = 123.0))

    carryForward.reset()
    val patched = carryForward.updateAndPatch(telemetry(tempMotor = null, tempMosfet = null, odometer = null))

    assertNull(patched.tempMotor)
    assertNull(patched.tempMosfet)
    assertNull(patched.odometer)
  }

  private fun telemetry(
    tempMotor: Double?,
    tempMosfet: Double?,
    odometer: Double?,
  ): RefloatTelemetry = RefloatTelemetry(
    hasFault = false,
    faultCode = 0,
    pitch = 0.0,
    roll = 0.0,
    balancePitch = 0.0,
    balanceCurrent = 0.0,
    speed = 0.0,
    batteryVoltage = 50.0,
    motorCurrent = 0.0,
    batteryCurrent = 0.0,
    erpm = 0,
    dutyCycle = 0.0,
    state = 0,
    switchState = 0,
    adc1 = 0.0,
    adc2 = 0.0,
    odometer = odometer,
    tempMosfet = tempMosfet,
    tempMotor = tempMotor,
    avgLatency = null,
    lastPacketAt = 1L,
    location = null,
  )
}
