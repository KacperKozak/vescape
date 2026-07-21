package expo.modules.vescapecore.config

internal sealed class RefloatConfigWriteVerification {
  object Success : RefloatConfigWriteVerification()
  data class Failure(val message: String) : RefloatConfigWriteVerification()
}

// @parity /modules/vescape-core/ios/config/RefloatConfigWriteVerifier.swift
internal object RefloatConfigWriteVerifier {
  fun verifyExactBytes(expected: ByteArray, actual: ByteArray): RefloatConfigWriteVerification {
    if (expected.contentEquals(actual)) return RefloatConfigWriteVerification.Success

    if (expected.size != actual.size) {
      return RefloatConfigWriteVerification.Failure(
        "Verification failed: expected ${expected.size} bytes, read back ${actual.size} bytes",
      )
    }

    val firstMismatch = expected.indices.first { expected[it] != actual[it] }
    return RefloatConfigWriteVerification.Failure(
      "Verification failed: first byte mismatch at offset $firstMismatch",
    )
  }
}
