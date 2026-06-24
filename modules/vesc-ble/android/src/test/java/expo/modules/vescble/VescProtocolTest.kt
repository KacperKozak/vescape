package expo.modules.vescble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VescProtocolTest {
  @Test
  fun buildsRemoteTiltChuckCommand() {
    // Neutral slider (128) inverts to a centered chuck Y byte (127).
    assertArrayEquals(
      byteArrayOf(COMM_SET_CHUCK_DATA.toByte(), 0, 127),
      buildRemoteTiltCommand(BoardTransport.Direct, value = 128),
    )
  }

  @Test
  fun framesRemoteTiltChuckForCan() {
    // Full slider (255) inverts to chuck Y 0, wrapped in a CAN forward frame.
    assertArrayEquals(
      byteArrayOf(COMM_FORWARD_CAN.toByte(), 7, COMM_SET_CHUCK_DATA.toByte(), 0, 0),
      buildRemoteTiltCommand(BoardTransport.Can(7), value = 255),
    )
  }

  @Test
  fun parsesFirmwareVersionPayloads() {
    assertNull(parseFwVersion(byteArrayOf(COMM_FW_VERSION.toByte(), 6)))
    assertEquals("FW 6.05", parseFwVersion(byteArrayOf(COMM_FW_VERSION.toByte(), 6, 5)))
    assertEquals(
      "FW 6.05 · VESC Express · Refloat, Float Package",
      parseFwVersion(fwVersionPayload("VESC Express", "Refloat", "Float Package")),
    )
  }

  @Test
  fun toleratesTruncatedFirmwareCustomConfigTail() {
    val payload = fwVersionPayload("VESC", "Refloat").copyOfRange(0, 3 + 4 + 1 + 15 + 1 + 4)

    assertEquals("FW 6.05 · VESC · Refl", parseFwVersion(payload))
  }

  @Test
  fun codecRoundTripsSplitFrameThroughReassembler() {
    val payload = byteArrayOf(COMM_CUSTOM_APP_DATA.toByte(), REFLOAT_MAGIC.toByte(), REFLOAT_GET_ALLDATA.toByte(), 2)
    val frame = VescPacketCodec.encode(payload)
    val reassembler = VescPacketReassembler()

    assertTrue(reassembler.feed(frame.copyOfRange(0, 3)).isEmpty())
    val packets = reassembler.feed(frame.copyOfRange(3, frame.size))

    assertEquals(1, packets.size)
    assertArrayEquals(payload, packets.single())
  }

  @Test
  fun parsesNormalRefloatTelemetryPayload() {
    val payload = ByteArray(42)
    payload[0] = COMM_CUSTOM_APP_DATA.toByte()
    payload[1] = REFLOAT_MAGIC.toByte()
    payload[2] = REFLOAT_GET_ALLDATA.toByte()
    payload[3] = 2
    putInt16(payload, 4, 123)
    putInt16(payload, 6, 45)
    putInt16(payload, 8, -67)
    payload[10] = 1
    payload[11] = 2
    payload[12] = 100.toByte()
    payload[13] = 75
    putInt16(payload, 20, 91)
    putInt16(payload, 23, 776)
    putInt16(payload, 25, 3210)
    putInt16(payload, 27, -123)
    putInt16(payload, 29, 456)
    putInt16(payload, 31, -78)
    payload[33] = 178.toByte()
    putInt32(payload, 35, 0x3f800000)
    payload[39] = 80
    payload[40] = 100

    val telemetry = parseRefloatGetAllData(payload, avgLatency = 42, packetAt = 1234L, location = null)!!

    assertFalse(telemetry.hasFault)
    assertEquals(12.3, telemetry.balanceCurrent, 0.001)
    assertEquals(4.5, telemetry.balancePitch, 0.001)
    assertEquals(-6.7, telemetry.roll, 0.001)
    assertEquals(9.1, telemetry.pitch, 0.001)
    assertEquals(77.6, telemetry.batteryVoltage, 0.001)
    assertEquals(-44.28, telemetry.speed, 0.001)
    assertEquals(0.5, telemetry.dutyCycle, 0.001)
    assertEquals(1.0, telemetry.odometer!!, 0.001)
    assertEquals(40.0, telemetry.tempMosfet!!, 0.001)
    assertEquals(50.0, telemetry.tempMotor!!, 0.001)
    assertEquals(42, telemetry.avgLatency)
    assertEquals(1234L, telemetry.lastPacketAt)
    assertNull(telemetry.location)
  }

  @Test
  fun clampsIdleDutyQuantization() {
    val payload = ByteArray(42)
    payload[0] = COMM_CUSTOM_APP_DATA.toByte()
    payload[1] = REFLOAT_MAGIC.toByte()
    payload[2] = REFLOAT_GET_ALLDATA.toByte()
    payload[3] = 2

    payload[33] = 129.toByte()
    assertEquals(0.0, parseRefloatGetAllData(payload, null, 1L, null)!!.dutyCycle, 0.001)

    payload[33] = 127.toByte()
    assertEquals(0.0, parseRefloatGetAllData(payload, null, 1L, null)!!.dutyCycle, 0.001)

    payload[33] = 130.toByte()
    assertEquals(0.02, parseRefloatGetAllData(payload, null, 1L, null)!!.dutyCycle, 0.001)
  }

  @Test
  fun parsesFaultPayload() {
    val payload = byteArrayOf(
      COMM_CUSTOM_APP_DATA.toByte(),
      REFLOAT_MAGIC.toByte(),
      REFLOAT_GET_ALLDATA.toByte(),
      69,
      7,
    )

    val telemetry = parseRefloatGetAllData(payload, avgLatency = null, packetAt = 200L, location = null)!!

    assertTrue(telemetry.hasFault)
    assertEquals(7, telemetry.faultCode)
    assertEquals(200L, telemetry.lastPacketAt)
  }

  @Test
  fun parsesBmsCellVoltagesBalancingAndSoc() {
    val payload = ByteArray(45)
    payload[0] = COMM_BMS_GET_VALUES.toByte()
    putInt32(payload, 1, 60_000_000) // v_tot 60.0V (scale 1e6)
    putInt32(payload, 9, 5_000_000) // i_in 5.0A (scale 1e6)
    payload[25] = 3 // cell_num
    putInt16(payload, 26, 3650) // 3.650V
    putInt16(payload, 28, 3700) // 3.700V
    putInt16(payload, 30, 3680) // 3.680V
    payload[32] = 0 // balancing cell 0
    payload[33] = 1 // balancing cell 1
    payload[34] = 0 // balancing cell 2
    payload[35] = 0 // temp_adc_num
    payload[44] = 216.toByte() // soc ≈ 0.847

    val bms = parseBmsValues(payload, packetAt = 555L)!!

    assertEquals(555L, bms.capturedAt)
    assertEquals(60.0, bms.voltageTotal, 0.001)
    assertEquals(5.0, bms.current, 0.001)
    assertEquals(listOf(3.65, 3.70, 3.68), bms.cellVoltages.map { (it * 1000).toInt() / 1000.0 })
    assertEquals(listOf(false, true, false), bms.balancing)
    assertEquals(216.0 / 255.0, bms.soc!!, 0.001)
  }

  @Test
  fun parsesBmsWithoutTrailingFields() {
    // id + 6 float32 + cell_num + 2 cells, nothing after.
    val payload = ByteArray(30)
    payload[0] = COMM_BMS_GET_VALUES.toByte()
    payload[25] = 2
    putInt16(payload, 26, 4100)
    putInt16(payload, 28, 4050)

    val bms = parseBmsValues(payload, packetAt = 1L)!!

    assertEquals(2, bms.cellVoltages.size)
    assertEquals(4.1, bms.cellVoltages[0], 0.001)
    assertEquals(listOf(false, false), bms.balancing)
    assertNull(bms.soc)
  }

  @Test
  fun rejectsNonBmsOrTruncatedPayloads() {
    assertNull(parseBmsValues(byteArrayOf(COMM_FW_VERSION.toByte()), 1L))
    val tooShort = ByteArray(26)
    tooShort[0] = COMM_BMS_GET_VALUES.toByte()
    tooShort[25] = 5 // claims 5 cells but no cell bytes follow
    assertNull(parseBmsValues(tooShort, 1L))
  }

  private fun putInt16(bytes: ByteArray, offset: Int, value: Int) {
    bytes[offset] = ((value shr 8) and 0xff).toByte()
    bytes[offset + 1] = (value and 0xff).toByte()
  }

  private fun fwVersionPayload(hardwareName: String, vararg customConfigs: String): ByteArray {
    val bytes = ArrayList<Byte>()
    bytes += COMM_FW_VERSION.toByte()
    bytes += 6
    bytes += 5
    hardwareName.encodeToByteArray().forEach { bytes += it }
    bytes += 0
    repeat(15) { bytes += 0 }
    bytes += customConfigs.size.toByte()
    for (config in customConfigs) {
      config.encodeToByteArray().forEach { bytes += it }
      bytes += 0
    }
    return bytes.toByteArray()
  }

  private fun putInt32(bytes: ByteArray, offset: Int, value: Int) {
    bytes[offset] = ((value shr 24) and 0xff).toByte()
    bytes[offset + 1] = ((value shr 16) and 0xff).toByte()
    bytes[offset + 2] = ((value shr 8) and 0xff).toByte()
    bytes[offset + 3] = (value and 0xff).toByte()
  }
}
