package expo.modules.vescapecore.diagnostics

private const val PAYLOAD_PREFIX_BYTES = 32

internal object DiagnosticPayloadProperties {
    fun telemetry(payload: ByteArray): Map<String, Any?> {
        val commandByte = payload.getOrNull(0)?.toInt()?.and(0xff)
        val modeByte = payload.getOrNull(3)?.toInt()?.and(0xff)
        return mapOf(
            "payload_size" to payload.size,
            "command_byte" to commandByte,
            "mode_byte" to modeByte,
            "payload_prefix_hex" to payload
                .take(PAYLOAD_PREFIX_BYTES)
                .joinToString("") { "%02x".format(it) },
        )
    }

    fun configBlob(config: ByteArray?): Map<String, Any?> {
        if (config == null) return emptyMap()
        return mapOf(
            "raw_config_length" to config.size,
            "raw_config_hex" to config.joinToString("") { "%02x".format(it) },
        )
    }
}
