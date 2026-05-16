package expo.modules.vescble

import java.nio.ByteBuffer
import java.nio.ByteOrder

internal data class RefloatConfigXmlChunk(
  val confInd: Int,
  val totalLength: Int,
  val offset: Int,
  val chunk: ByteArray,
)

internal data class RefloatConfigBytes(
  val confInd: Int,
  val config: ByteArray,
)

internal object RefloatConfigProtocol {
  private fun commandOffset(payload: ByteArray, expectedCommand: Int): Int? {
    if (payload.isEmpty()) return null
    val cmd = payload[0].toInt() and 0xff
    if (cmd == expectedCommand) return 0
    if (cmd == COMM_FORWARD_CAN && payload.size >= 3) {
      val forwarded = payload[2].toInt() and 0xff
      if (forwarded == expectedCommand) return 2
    }
    return null
  }

  fun buildGetCustomConfigXml(
    canId: Int,
    confInd: Int,
    length: Int,
    offset: Int,
  ): ByteArray {
    require(canId in 0..255) { "canId must fit uint8" }
    require(confInd in 0..255) { "confInd must fit uint8" }
    require(length >= 0) { "length must be non-negative" }
    require(offset >= 0) { "offset must be non-negative" }
    return ByteBuffer.allocate(12)
      .order(ByteOrder.BIG_ENDIAN)
      .put(COMM_FORWARD_CAN.toByte())
      .put(canId.toByte())
      .put(COMM_GET_CUSTOM_CONFIG_XML.toByte())
      .put(confInd.toByte())
      .putInt(length)
      .putInt(offset)
      .array()
  }

  fun buildGetCustomConfig(canId: Int, confInd: Int): ByteArray {
    require(canId in 0..255) { "canId must fit uint8" }
    require(confInd in 0..255) { "confInd must fit uint8" }
    return byteArrayOf(
      COMM_FORWARD_CAN.toByte(),
      canId.toByte(),
      COMM_GET_CUSTOM_CONFIG.toByte(),
      confInd.toByte(),
    )
  }

  fun parseCustomConfigXmlResponse(payload: ByteArray): RefloatConfigXmlChunk? {
    val cmdOffset = commandOffset(payload, COMM_GET_CUSTOM_CONFIG_XML) ?: return null
    if (payload.size < cmdOffset + 10) return null
    val view = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)
    view.position(cmdOffset + 1)
    val confInd = view.get().toInt() and 0xff
    val totalLength = view.int
    val dataOffset = view.int
    if (totalLength < 0 || dataOffset < 0 || dataOffset > totalLength) return null
    val chunk = payload.copyOfRange(cmdOffset + 10, payload.size)
    if (dataOffset + chunk.size > totalLength) return null
    return RefloatConfigXmlChunk(confInd, totalLength, dataOffset, chunk)
  }

  fun parseCustomConfigResponse(payload: ByteArray): RefloatConfigBytes? {
    val offset = commandOffset(payload, COMM_GET_CUSTOM_CONFIG) ?: return null
    if (payload.size < offset + 2) return null
    val confInd = payload[offset + 1].toInt() and 0xff
    return RefloatConfigBytes(confInd, payload.copyOfRange(offset + 2, payload.size))
  }
}
