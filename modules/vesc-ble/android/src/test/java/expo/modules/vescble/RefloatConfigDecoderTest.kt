package expo.modules.vescble

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefloatConfigDecoderTest {
  @Test
  fun decodesAllowlistedValuesIntoGroups() {
    val schema = RefloatConfigSchema(
      hash = "schema-hash",
      fields = listOf(
        RefloatConfigSchemaField("kp", RefloatConfigValueType.FLOAT32, "Angle P", null, 0.0, 100.0, 0),
        RefloatConfigSchemaField("kp2", RefloatConfigValueType.FLOAT32, "Rate P", null, 0.0, 5.0, 4),
        RefloatConfigSchemaField("unused", RefloatConfigValueType.INT32, "Unused", null, null, null, 8),
      ),
    )
    val bytes = ByteBuffer.allocate(12)
      .order(ByteOrder.BIG_ENDIAN)
      .putFloat(26.0f)
      .putFloat(0.9f)
      .putInt(123)
      .array()

    val snapshot = RefloatConfigDecoder.decode(
      schema = schema,
      rawConfig = bytes,
      boardId = "board-1",
      canId = 7,
      capturedAt = 100L,
      fwVersion = null,
    )

    assertEquals("schema-hash", snapshot.schemaHash)
    assertEquals(12, snapshot.rawConfigLength)
    assertEquals(26.0, snapshot.groups.first().fields[0].value as Double, 0.001)
    assertEquals(0.9, snapshot.groups.first().fields[1].value as Double, 0.001)
    assertTrue(snapshot.rawConfigHash.isNotBlank())
  }

  @Test(expected = RefloatConfigDecodeException::class)
  fun rejectsTruncatedConfig() {
    val schema = RefloatConfigSchema(
      hash = "schema-hash",
      fields = listOf(
        RefloatConfigSchemaField("kp", RefloatConfigValueType.FLOAT32, "Angle P", null, 0.0, 100.0, 0),
      ),
    )

    RefloatConfigDecoder.decode(schema, byteArrayOf(1, 2), null, 7, 100L, null)
  }
}
