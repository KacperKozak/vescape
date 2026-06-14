package expo.modules.vescble

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertSame
import org.junit.Assert.fail
import org.junit.Test

class BoardTransportTest {
  @Test
  fun directTransportReturnsCommandUnchanged() {
    val cmd = byteArrayOf(COMM_CUSTOM_APP_DATA.toByte(), REFLOAT_MAGIC.toByte())

    val framed = DirectTransport.frame(cmd)

    assertSame(cmd, framed)
  }

  @Test
  fun canForwardTransportPrefixesCommand() {
    val cmd = byteArrayOf(COMM_GET_CUSTOM_CONFIG.toByte(), 0)

    val framed = CanForwardTransport(7).frame(cmd)

    assertArrayEquals(
      byteArrayOf(COMM_FORWARD_CAN.toByte(), 7, COMM_GET_CUSTOM_CONFIG.toByte(), 0),
      framed,
    )
  }

  @Test
  fun canForwardTransportRejectsCanIdsOutsideUint8() {
    assertInvalidCanId(-1)
    assertInvalidCanId(256)
  }

  private fun assertInvalidCanId(canId: Int) {
    try {
      CanForwardTransport(canId)
      fail("Expected invalid CAN id to throw")
    } catch (e: IllegalArgumentException) {
      // expected
    }
  }
}
