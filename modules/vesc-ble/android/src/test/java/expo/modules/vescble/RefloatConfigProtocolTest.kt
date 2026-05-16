package expo.modules.vescble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RefloatConfigProtocolTest {
  @Test
  fun buildsForwardedCustomConfigXmlRequest() {
    val payload = RefloatConfigProtocol.buildGetCustomConfigXml(canId = 7, confInd = 0, length = 384, offset = 768)

    assertArrayEquals(
      byteArrayOf(
        COMM_FORWARD_CAN.toByte(),
        7,
        COMM_GET_CUSTOM_CONFIG_XML.toByte(),
        0,
        0, 0, 1, 0x80.toByte(),
        0, 0, 3, 0,
      ),
      payload,
    )
  }

  @Test
  fun buildsForwardedCustomConfigRequest() {
    val payload = RefloatConfigProtocol.buildGetCustomConfig(canId = 7, confInd = 0)

    assertArrayEquals(
      byteArrayOf(
        COMM_FORWARD_CAN.toByte(),
        7,
        COMM_GET_CUSTOM_CONFIG.toByte(),
        0,
      ),
      payload,
    )
  }

  @Test
  fun parsesCustomConfigXmlResponse() {
    val payload = byteArrayOf(
      COMM_GET_CUSTOM_CONFIG_XML.toByte(),
      0,
      0, 0, 0, 10,
      0, 0, 0, 4,
      't'.code.toByte(),
      'e'.code.toByte(),
      's'.code.toByte(),
      't'.code.toByte(),
    )

    val parsed = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload)

    assertEquals(0, parsed?.confInd)
    assertEquals(10, parsed?.totalLength)
    assertEquals(4, parsed?.offset)
    assertArrayEquals("test".encodeToByteArray(), parsed?.chunk)
  }

  @Test
  fun parsesForwardedCustomConfigXmlResponse() {
    val payload = byteArrayOf(
      COMM_FORWARD_CAN.toByte(),
      7,
      COMM_GET_CUSTOM_CONFIG_XML.toByte(),
      0,
      0, 0, 0, 10,
      0, 0, 0, 4,
      't'.code.toByte(),
      'e'.code.toByte(),
      's'.code.toByte(),
      't'.code.toByte(),
    )

    val parsed = RefloatConfigProtocol.parseCustomConfigXmlResponse(payload)

    assertEquals(0, parsed?.confInd)
    assertEquals(10, parsed?.totalLength)
    assertEquals(4, parsed?.offset)
    assertArrayEquals("test".encodeToByteArray(), parsed?.chunk)
  }

  @Test
  fun ignoresWrongXmlCommandResponse() {
    val payload = byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 0)
    assertNull(RefloatConfigProtocol.parseCustomConfigXmlResponse(payload))
  }

  @Test
  fun parsesCustomConfigResponse() {
    val payload = byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 0, 1, 2, 3, 4)
    val parsed = RefloatConfigProtocol.parseCustomConfigResponse(payload)
    assertEquals(0, parsed?.confInd)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), parsed?.config)
  }

  @Test
  fun parsesForwardedCustomConfigResponse() {
    val payload = byteArrayOf(COMM_FORWARD_CAN.toByte(), 7, COMM_GET_CUSTOM_CONFIG.toByte(), 0, 1, 2, 3, 4)
    val parsed = RefloatConfigProtocol.parseCustomConfigResponse(payload)
    assertEquals(0, parsed?.confInd)
    assertArrayEquals(byteArrayOf(1, 2, 3, 4), parsed?.config)
  }
}
