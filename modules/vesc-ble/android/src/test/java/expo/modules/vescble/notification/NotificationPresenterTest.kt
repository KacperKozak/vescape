package expo.modules.vescble.notification

import expo.modules.vescble.LocationSnapshot
import expo.modules.vescble.RefloatTelemetry
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
    fun `formatNotificationText reports fault when hasFault set`() {
        val text = NotificationPresenter.formatNotificationText(telemetry(hasFault = true, faultCode = 7))
        assertEquals("Fault 7", text)
    }

    @Test
    fun `formatNotificationText formats speed duty voltage`() {
        val text = NotificationPresenter.formatNotificationText(
            telemetry(speed = 25.5, dutyCycle = 0.42, batteryVoltage = 75.13),
        )
        assertEquals("25.5 km/h | 42% duty | 75.1V", text)
    }

    @Test
    fun `formatNotificationText takes absolute speed`() {
        val text = NotificationPresenter.formatNotificationText(
            telemetry(speed = -12.0, dutyCycle = 0.0, batteryVoltage = 50.0),
        )
        assertEquals("12.0 km/h | 0% duty | 50.0V", text)
    }

    @Test
    fun `formatNotificationText zeroes duty when below threshold`() {
        val text = NotificationPresenter.formatNotificationText(
            telemetry(speed = 0.0, dutyCycle = 0.005, batteryVoltage = 50.0),
        )
        assertEquals("0.0 km/h | 0% duty | 50.0V", text)
    }

    @Test
    fun `formatBatteryVoltageChipText returns FAULT for fault`() {
        assertEquals(
            "FAULT",
            NotificationPresenter.formatBatteryVoltageChipText(telemetry(hasFault = true)),
        )
    }

    @Test
    fun `formatBatteryVoltageChipText formats voltage`() {
        assertEquals(
            "75.1V",
            NotificationPresenter.formatBatteryVoltageChipText(telemetry(batteryVoltage = 75.13)),
        )
    }

    @Test
    fun `formatGpsNotificationText converts mps to kmh`() {
        assertEquals(
            "GPS 18.0 km/h",
            NotificationPresenter.formatGpsNotificationText(location(speedMps = 5.0)),
        )
    }

    @Test
    fun `formatGpsNotificationText handles null speed`() {
        assertEquals(
            "GPS 0.0 km/h",
            NotificationPresenter.formatGpsNotificationText(location(speedMps = null)),
        )
    }

    @Test
    fun `formatGpsNotificationText takes absolute speed`() {
        assertEquals(
            "GPS 36.0 km/h",
            NotificationPresenter.formatGpsNotificationText(location(speedMps = -10.0)),
        )
    }

    private fun telemetry(
        hasFault: Boolean = false,
        faultCode: Int = 0,
        speed: Double = 0.0,
        dutyCycle: Double = 0.0,
        batteryVoltage: Double = 0.0,
    ): RefloatTelemetry = RefloatTelemetry(
        hasFault = hasFault,
        faultCode = faultCode,
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

    private fun location(speedMps: Double?): LocationSnapshot = LocationSnapshot(
        latitude = 0.0,
        longitude = 0.0,
        speedMps = speedMps,
        bearingDeg = null,
        accuracyM = null,
        altitudeM = null,
        timestamp = 0L,
        precise = false,
    )
}
