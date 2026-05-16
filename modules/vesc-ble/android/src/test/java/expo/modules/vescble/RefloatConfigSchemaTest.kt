package expo.modules.vescble

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefloatConfigSchemaTest {
  @Test
  fun parsesParamsFromVescStyleXml() {
    val xml = """
      <CustomConfiguration>
        <params>
          <param name="kp" type="float" min="0" max="100" unit="" label="Angle P" />
          <param name="kp2" type="float" min="0" max="5" unit="" label="Rate P" />
          <param name="quickstop_enabled" type="bool" label="Quickstop" />
        </params>
      </CustomConfiguration>
    """.trimIndent()

    val schema = RefloatConfigSchemaParser.parse(xml.encodeToByteArray())

    assertEquals("kp", schema.fields[0].id)
    assertEquals(RefloatConfigValueType.FLOAT32, schema.fields[0].type)
    assertEquals(0.0, schema.fields[0].min)
    assertEquals(100.0, schema.fields[0].max)
    assertEquals("Angle P", schema.fields[0].label)
    assertEquals(RefloatConfigValueType.BOOL, schema.fields[2].type)
    assertTrue(schema.hash.isNotBlank())
  }

  @Test(expected = RefloatConfigSchemaException::class)
  fun rejectsMissingFieldNames() {
    val xml = """<CustomConfiguration><params><param type="float" /></params></CustomConfiguration>"""
    RefloatConfigSchemaParser.parse(xml.encodeToByteArray())
  }

  @Test(expected = RefloatConfigSchemaException::class)
  fun wrapsMalformedXmlAsSchemaError() {
    RefloatConfigSchemaParser.parse("<CustomConfiguration><params>".encodeToByteArray())
  }
}
