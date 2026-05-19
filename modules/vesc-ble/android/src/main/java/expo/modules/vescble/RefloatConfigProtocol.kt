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
  val packageSignature: Long,
  val config: ByteArray,
)

internal sealed class RefloatConfigProtocolResult<out T> {
  data class Success<T>(val value: T) : RefloatConfigProtocolResult<T>()
  data class Failure(val message: String) : RefloatConfigProtocolResult<Nothing>()
}

internal object RefloatConfigProtocol {
  private fun commandOffset(payload: ByteArray, expectedCommand: Int): RefloatConfigProtocolResult<Int> {
    if (payload.isEmpty()) {
      return RefloatConfigProtocolResult.Failure("Empty Refloat config response")
    }
    val cmd = payload[0].toInt() and 0xff
    if (cmd == expectedCommand) return RefloatConfigProtocolResult.Success(0)
    if (cmd == COMM_FORWARD_CAN) {
      if (payload.size < 3) {
        return RefloatConfigProtocolResult.Failure("Short forwarded Refloat config response")
      }
      val forwarded = payload[2].toInt() and 0xff
      if (forwarded == expectedCommand) return RefloatConfigProtocolResult.Success(2)
      return RefloatConfigProtocolResult.Failure(
        "Unexpected forwarded Refloat config command $forwarded, expected $expectedCommand",
      )
    }
    return RefloatConfigProtocolResult.Failure(
      "Unexpected Refloat config command $cmd, expected $expectedCommand",
    )
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

  fun parseCustomConfigXmlResponse(
    payload: ByteArray,
    expectedConfInd: Int = 0,
  ): RefloatConfigProtocolResult<RefloatConfigXmlChunk> {
    val cmdOffset = when (val result = commandOffset(payload, COMM_GET_CUSTOM_CONFIG_XML)) {
      is RefloatConfigProtocolResult.Success -> result.value
      is RefloatConfigProtocolResult.Failure -> return result
    }
    if (payload.size < cmdOffset + 10) {
      return RefloatConfigProtocolResult.Failure(
        "Short Refloat config XML response: ${payload.size - cmdOffset} bytes",
      )
    }
    val view = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)
    view.position(cmdOffset + 1)
    val confInd = view.get().toInt() and 0xff
    if (confInd != expectedConfInd) {
      return RefloatConfigProtocolResult.Failure("Unexpected Refloat config XML index $confInd")
    }
    val totalLength = view.int
    val dataOffset = view.int
    if (totalLength < 0) {
      return RefloatConfigProtocolResult.Failure("Negative Refloat config XML length $totalLength")
    }
    if (dataOffset < 0 || dataOffset > totalLength) {
      return RefloatConfigProtocolResult.Failure(
        "Invalid Refloat config XML offset $dataOffset for length $totalLength",
      )
    }
    val chunk = payload.copyOfRange(cmdOffset + 10, payload.size)
    if (dataOffset + chunk.size > totalLength) {
      return RefloatConfigProtocolResult.Failure(
        "Refloat config XML chunk exceeds length: offset=$dataOffset chunk=${chunk.size} length=$totalLength",
      )
    }
    return RefloatConfigProtocolResult.Success(RefloatConfigXmlChunk(confInd, totalLength, dataOffset, chunk))
  }

  fun buildSetCustomConfig(canId: Int, confInd: Int, configBytes: ByteArray): ByteArray {
    require(canId in 0..255) { "canId must fit uint8" }
    require(confInd in 0..255) { "confInd must fit uint8" }
    val buf = ByteBuffer.allocate(4 + configBytes.size).order(ByteOrder.BIG_ENDIAN)
    buf.put(COMM_FORWARD_CAN.toByte())
    buf.put(canId.toByte())
    buf.put(COMM_SET_CUSTOM_CONFIG.toByte())
    buf.put(confInd.toByte())
    buf.put(configBytes)
    return buf.array()
  }

  fun parseSetCustomConfigResponse(
    payload: ByteArray,
    expectedConfInd: Int = 0,
  ): RefloatConfigProtocolResult<Int> {
    val offset = when (val result = commandOffset(payload, COMM_SET_CUSTOM_CONFIG)) {
      is RefloatConfigProtocolResult.Success -> result.value
      is RefloatConfigProtocolResult.Failure -> return result
    }
    if (payload.size < offset + 2) {
      return RefloatConfigProtocolResult.Failure(
        "Short Refloat set config response: ${payload.size - offset} bytes",
      )
    }
    val confInd = payload[offset + 1].toInt() and 0xff
    if (confInd != expectedConfInd) {
      return RefloatConfigProtocolResult.Failure("Unexpected Refloat set config index $confInd")
    }
    return RefloatConfigProtocolResult.Success(confInd)
  }

  fun parseCustomConfigResponse(
    payload: ByteArray,
    expectedConfInd: Int = 0,
  ): RefloatConfigProtocolResult<RefloatConfigBytes> {
    val offset = when (val result = commandOffset(payload, COMM_GET_CUSTOM_CONFIG)) {
      is RefloatConfigProtocolResult.Success -> result.value
      is RefloatConfigProtocolResult.Failure -> return result
    }
    if (payload.size < offset + 6) {
      return RefloatConfigProtocolResult.Failure(
        "Short Refloat config response: ${payload.size - offset} bytes",
      )
    }
    val view = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN)
    view.position(offset + 2)
    val confInd = payload[offset + 1].toInt() and 0xff
    if (confInd != expectedConfInd) {
      return RefloatConfigProtocolResult.Failure("Unexpected Refloat config index $confInd")
    }
    val packageSignature = view.int.toLong() and 0xffffffffL
    return RefloatConfigProtocolResult.Success(
      RefloatConfigBytes(
        confInd = confInd,
        packageSignature = packageSignature,
        config = payload.copyOfRange(offset + 6, payload.size),
      ),
    )
  }
}
