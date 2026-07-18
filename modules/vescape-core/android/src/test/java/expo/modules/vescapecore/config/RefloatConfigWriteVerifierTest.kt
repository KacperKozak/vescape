package expo.modules.vescapecore.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RefloatConfigWriteVerifierTest {
  @Test
  fun acceptsByteIdenticalConfig() {
    val result = RefloatConfigWriteVerifier.verifyExactBytes(
      expected = byteArrayOf(1, 2, 3),
      actual = byteArrayOf(1, 2, 3),
    )

    assertTrue(result is RefloatConfigWriteVerification.Success)
  }

  @Test
  fun rejectsSameLengthConfigWithHiddenByteMismatch() {
    val result = RefloatConfigWriteVerifier.verifyExactBytes(
      expected = byteArrayOf(1, 2, 3, 4),
      actual = byteArrayOf(1, 2, 99, 4),
    )

    assertTrue(result is RefloatConfigWriteVerification.Failure)
    assertEquals(
      "Verification failed: first byte mismatch at offset 2",
      (result as RefloatConfigWriteVerification.Failure).message,
    )
  }

  @Test
  fun rejectsDifferentLengthConfig() {
    val result = RefloatConfigWriteVerifier.verifyExactBytes(
      expected = byteArrayOf(1, 2, 3),
      actual = byteArrayOf(1, 2, 3, 4),
    )

    assertTrue(result is RefloatConfigWriteVerification.Failure)
    assertEquals(
      "Verification failed: expected 3 bytes, read back 4 bytes",
      (result as RefloatConfigWriteVerification.Failure).message,
    )
  }
}
