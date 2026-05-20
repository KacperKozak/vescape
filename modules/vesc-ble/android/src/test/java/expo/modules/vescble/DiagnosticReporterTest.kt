package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class DiagnosticReporterTest {
  @Test
  fun shapesTelemetryPayloadDebugFieldsWithoutFullPayload() {
    val payload = ByteArray(40) { it.toByte() }

    val properties = DiagnosticReporter.telemetryPayloadProperties(payload)

    assertEquals(40, properties["payload_size"])
    assertEquals(0, properties["command_byte"])
    assertEquals(3, properties["mode_byte"])
    assertEquals(64, (properties["payload_prefix_hex"] as String).length)
  }

  @Test
  fun configBlobPropertiesIncludeRawConfigOnlyForExplicitConfigFailures() {
    val properties = DiagnosticReporter.configBlobProperties(byteArrayOf(0x01, 0x2a, 0xff.toByte()))

    assertEquals(3, properties["raw_config_length"])
    assertEquals("012aff", properties["raw_config_hex"])
    assertFalse(DiagnosticReporter.configBlobProperties(null).containsKey("raw_config_hex"))
  }
}
