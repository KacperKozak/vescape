package expo.modules.vescble.diagnostics

import expo.modules.vescble.SessionConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticsRecorderTest {

    private data class CapturedEvent(val name: String, val properties: Map<String, Any?>)

    private val session = SessionConfig(
        appBoardId = "board-1",
        deviceId = "AA:BB",
        deviceName = "Test Board",
        transport = null,
        canId = 10,
        pollIntervalMs = 100L,
        recordingEnabled = false,
        telemetryRecordingEnabled = false,
        autoReconnect = true,
    )

    private val staticContext = DiagnosticContext(
        phaseWire = "connected",
        connectionSeq = 3L,
        connectAttempt = 1,
        autoReconnectAttempt = 0,
        canId = 10,
        directConnection = false,
        lastSentCommand = 1,
        lastReceivedCommandByte = 2,
        lastTelemetryAt = 12345L,
    )

    private fun recorder(
        local: MutableList<CapturedEvent>,
        remote: MutableList<CapturedEvent>,
        ctx: DiagnosticContext = staticContext,
    ) = DiagnosticsRecorder(
        local = { name, props -> local.add(CapturedEvent(name, props)) },
        remote = { name, props -> remote.add(CapturedEvent(name, props)) },
        context = { ctx },
    )

    @Test
    fun `captureDiagnostic writes to local before remote`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        r.captureDiagnostic("event", mapOf("k" to "v"))

        assertEquals(listOf(CapturedEvent("event", mapOf("k" to "v"))), local)
        assertEquals(listOf(CapturedEvent("event", mapOf("k" to "v"))), remote)
    }

    @Test
    fun `recordLocalDiagnostic skips remote sink`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        r.recordLocalDiagnostic("gatt_ready", session, "connect", mapOf("message" to "ok"))

        assertEquals(1, local.size)
        assertTrue(remote.isEmpty())
        assertEquals("gatt_ready", local[0].name)
        assertEquals("connect", local[0].properties["operation"])
        assertEquals("AA:BB", local[0].properties["ble_id"])
        assertEquals("ok", local[0].properties["message"])
    }

    @Test
    fun `telemetry parse failure reports once across repeated calls`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)
        val payload = ByteArray(4) { it.toByte() }

        repeat(5) { r.captureTelemetryParseFailed(payload, session) }

        assertEquals(5, r.telemetryParseFailedCount())
        assertEquals(1, remote.size)
        assertEquals(1, local.size)
        assertEquals("telemetry_parse_failed", remote[0].name)
        assertEquals(1, remote[0].properties["telemetry_parse_failed_count"])
        assertEquals("Invalid Refloat telemetry payload", remote[0].properties["message"])
    }

    @Test
    fun `flush emits aggregate event with total count then resets`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        repeat(4) { r.captureTelemetryParseFailed(ByteArray(2), session) }
        r.flushTelemetryDiagnostics("reconnect", session)

        assertEquals(0, r.telemetryParseFailedCount())
        assertEquals(2, remote.size)
        val flushEvent = remote[1]
        assertEquals("telemetry_parse_failed", flushEvent.name)
        assertEquals(4, flushEvent.properties["telemetry_parse_failed_count"])
        assertEquals("reconnect", flushEvent.properties["reason"])
        assertEquals("Telemetry parse failures aggregated", flushEvent.properties["message"])
    }

    @Test
    fun `flush is noop when no failures recorded`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        r.flushTelemetryDiagnostics("stop", session)

        assertTrue(local.isEmpty())
        assertTrue(remote.isEmpty())
    }

    @Test
    fun `parse failure reports again after flush`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        r.captureTelemetryParseFailed(ByteArray(2), session)
        r.flushTelemetryDiagnostics("reconnect", session)
        r.captureTelemetryParseFailed(ByteArray(2), session)

        assertEquals(3, remote.size)
        assertEquals(1, r.telemetryParseFailedCount())
        assertEquals(1, remote[2].properties["telemetry_parse_failed_count"])
    }

    @Test
    fun `reset clears count without emitting`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        r.captureTelemetryParseFailed(ByteArray(2), session)
        r.resetTelemetryParseFailedCounters()

        assertEquals(0, r.telemetryParseFailedCount())
        assertEquals(1, remote.size)

        r.captureTelemetryParseFailed(ByteArray(2), session)
        assertEquals(2, remote.size)
    }

    @Test
    fun `diagnosticProperties pulls from context provider`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        val props = r.diagnosticProperties(session, "telemetry")

        assertEquals("telemetry", props["operation"])
        assertEquals("connected", props["phase"])
        assertEquals(3L, props["connection_seq"])
        assertEquals(10, props["can_id"])
        assertEquals(false, props["direct_connection"])
        assertEquals(12345L, props["last_telemetry_timestamp"])
        assertEquals(true, props["auto_reconnect_enabled"])
    }

    @Test
    fun `diagnosticProperties omits last telemetry timestamp when never observed`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote, staticContext.copy(lastTelemetryAt = 0L))

        val props = r.diagnosticProperties(session, "connect")

        assertNull(props["last_telemetry_timestamp"])
    }

    @Test
    fun `diagnosticProperties tolerates null session`() {
        val local = mutableListOf<CapturedEvent>()
        val remote = mutableListOf<CapturedEvent>()
        val r = recorder(local, remote)

        val props = r.diagnosticProperties(null, "connect")

        assertNull(props["board_id"])
        assertNull(props["ble_id"])
        assertNull(props["auto_reconnect_enabled"])
        assertEquals("connect", props["operation"])
    }
}
