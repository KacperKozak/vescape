package expo.modules.vescble.notification

import expo.modules.vescble.BoardPhase
import expo.modules.vescble.RefloatTelemetry
import expo.modules.vescble.displayText
import java.util.Locale
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class NotificationPresenterTest {

    private lateinit var originalLocale: Locale

    @Before
    fun setUp() {
        originalLocale = Locale.getDefault()
        Locale.setDefault(Locale.US)
    }

    @After
    fun tearDown() {
        Locale.setDefault(originalLocale)
    }

    @Test
    fun `formatTelemetryText with battery percent`() {
        val text = NotificationFormatter.formatTelemetryText(
            telemetry(speed = 25.5, dutyCycle = 0.42, batteryVoltage = 75.13),
            batteryPercent = 45.0,
        )
        assertEquals("26km/h • 42% • 45% (75.1V)", text)
    }

    @Test
    fun `formatTelemetryText without battery percent falls back to voltage`() {
        val text = NotificationFormatter.formatTelemetryText(
            telemetry(speed = 25.5, dutyCycle = 0.42, batteryVoltage = 75.13),
            batteryPercent = null,
        )
        assertEquals("26km/h • 42% • 75.1V", text)
    }

    @Test
    fun `formatTelemetryText takes absolute speed and rounds to whole number`() {
        val text = NotificationFormatter.formatTelemetryText(
            telemetry(speed = -12.7, dutyCycle = 0.0, batteryVoltage = 50.0),
            batteryPercent = null,
        )
        assertEquals("13km/h • 0% • 50.0V", text)
    }

    @Test
    fun `formatTelemetryText zeroes duty when below threshold`() {
        val text = NotificationFormatter.formatTelemetryText(
            telemetry(speed = 0.0, dutyCycle = 0.005, batteryVoltage = 50.0),
            batteryPercent = 80.0,
        )
        assertEquals("0km/h • 0% • 80% (50.0V)", text)
    }

    @Test
    fun `displayText idle`() {
        assertEquals("Board not connected", BoardPhase.Idle.displayText())
    }

    @Test
    fun `displayText connecting`() {
        assertEquals("Connecting…", BoardPhase.Connecting.displayText())
    }

    @Test
    fun `displayText rescanning`() {
        assertEquals("Searching…", BoardPhase.Rescanning.displayText())
    }

    @Test
    fun `shortCriticalText connected with battery percent`() {
        assertEquals(
            "45%",
            NotificationFormatter.formatShortCriticalText(BoardPhase.Connected, telemetry(), 45.0),
        )
    }

    @Test
    fun `shortCriticalText connected without battery percent`() {
        assertEquals(
            "75.1V",
            NotificationFormatter.formatShortCriticalText(
                BoardPhase.Connected, telemetry(batteryVoltage = 75.13), null,
            ),
        )
    }

    @Test
    fun `shortCriticalText stale`() {
        assertEquals("⚠", NotificationFormatter.formatShortCriticalText(BoardPhase.Stale, null, null))
    }

    @Test
    fun `shortCriticalText error`() {
        assertEquals("✕", NotificationFormatter.formatShortCriticalText(BoardPhase.Error, null, null))
    }

    @Test
    fun `shortCriticalText connecting`() {
        assertEquals("…", NotificationFormatter.formatShortCriticalText(BoardPhase.Connecting, null, null))
    }

    @Test
    fun `shortCriticalText idle`() {
        assertEquals("—", NotificationFormatter.formatShortCriticalText(BoardPhase.Idle, null, null))
    }

    private fun telemetry(
        speed: Double = 0.0,
        dutyCycle: Double = 0.0,
        batteryVoltage: Double = 0.0,
    ): RefloatTelemetry = RefloatTelemetry(
        hasFault = false,
        faultCode = 0,
        pitch = 0.0,
        roll = 0.0,
        balancePitch = 0.0,
        balanceCurrent = 0.0,
        speed = speed,
        batteryVoltage = batteryVoltage,
        motorCurrent = 0.0,
        batteryCurrent = 0.0,
        erpm = 0,
        dutyCycle = dutyCycle,
        state = 0,
        switchState = 0,
        adc1 = 0.0,
        adc2 = 0.0,
        odometer = null,
        tempMosfet = null,
        tempMotor = null,
        avgLatency = null,
        lastPacketAt = 0L,
        location = null,
    )
}
