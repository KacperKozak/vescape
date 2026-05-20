package expo.modules.vescble

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig
import java.util.UUID

private const val DIAGNOSTIC_TAG = "DiagnosticReporter"
private const val POSTHOG_API_KEY_META = "expo.modules.vescble.POSTHOG_API_KEY"
private const val POSTHOG_HOST_META = "expo.modules.vescble.POSTHOG_HOST"
private const val DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"
private const val PAYLOAD_PREFIX_BYTES = 32
private const val DIAGNOSTIC_PREFS = "vesc_ble_diagnostics"
private const val DIAGNOSTIC_DISTINCT_ID_KEY = "diagnostic_distinct_id"

interface DiagnosticSink {
    fun capture(eventName: String, properties: Map<String, Any?>)
    fun flush()
}

class DiagnosticReporter private constructor(
    private val sink: DiagnosticSink,
    private val commonProperties: Map<String, Any?>,
    private val enabled: Boolean,
    private val host: String,
    private val distinctId: String?,
) {
    private var captureCount = 0
    private var lastEventName: String? = null
    private var lastCaptureAt: Long? = null

    fun capture(eventName: String, properties: Map<String, Any?> = emptyMap()) {
        captureCount += 1
        lastEventName = eventName
        lastCaptureAt = System.currentTimeMillis()
        sink.capture(eventName, sanitize(commonProperties + properties))
    }

    fun flush() {
        sink.flush()
    }

    fun status(): Map<String, Any?> = mapOf(
        "enabled" to enabled,
        "host" to host,
        "distinctId" to distinctId,
        "captureCount" to captureCount,
        "lastEventName" to lastEventName,
        "lastCaptureAt" to lastCaptureAt,
    )

    companion object {
        @Volatile private var shared: DiagnosticReporter? = null
        @Volatile private var warnedMissingConfig = false

        fun initialize(context: Context, sink: DiagnosticSink? = null): DiagnosticReporter {
            sink?.let {
                return DiagnosticReporter(
                    sink = it,
                    commonProperties = commonProperties(context),
                    enabled = true,
                    host = "test",
                    distinctId = "test",
                ).also { reporter ->
                    shared = reporter
                }
            }

            shared?.let { return it }
            synchronized(this) {
                shared?.let { return it }
                val appContext = context.applicationContext
                val metadata = appContext.packageManager
                    .getApplicationInfo(appContext.packageName, PackageManager.GET_META_DATA)
                    .metaData
                val apiKey = metadata?.getString(POSTHOG_API_KEY_META).orEmpty()
                val host = metadata?.getString(POSTHOG_HOST_META).orEmpty().ifBlank { DEFAULT_POSTHOG_HOST }
                val reporter = if (apiKey.isBlank()) {
                    if (!warnedMissingConfig) {
                        Log.w(
                            DIAGNOSTIC_TAG,
                            "PostHog diagnostics disabled: EXPO_PUBLIC_POSTHOG_API_KEY is missing",
                        )
                        warnedMissingConfig = true
                    }
                    DiagnosticReporter(
                        sink = NoopDiagnosticSink,
                        commonProperties = commonProperties(appContext),
                        enabled = false,
                        host = host,
                        distinctId = null,
                    )
                } else {
                    val distinctId = diagnosticDistinctId(appContext)
                    val commonProperties = commonProperties(appContext)
                    val config = PostHogAndroidConfig(apiKey, host).apply {
                        captureApplicationLifecycleEvents = false
                        captureDeepLinks = false
                        captureScreenViews = false
                    }
                    PostHogAndroid.setup(appContext, config)
                    PostHog.identify(
                        distinctId,
                        nonNullProperties(commonProperties) + mapOf("person_type" to "native_android_device"),
                        emptyMap<String, Any>(),
                    )
                    Log.i(DIAGNOSTIC_TAG, "PostHog diagnostics enabled host=$host")
                    DiagnosticReporter(
                        sink = PostHogDiagnosticSink,
                        commonProperties = commonProperties,
                        enabled = true,
                        host = host,
                        distinctId = distinctId,
                    )
                }
                shared = reporter
                return reporter
            }
        }

        fun get(context: Context): DiagnosticReporter = shared ?: initialize(context)

        fun resetForTests() {
            shared = null
            warnedMissingConfig = false
        }

        fun telemetryPayloadProperties(payload: ByteArray): Map<String, Any?> {
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

        fun configBlobProperties(config: ByteArray?): Map<String, Any?> {
            if (config == null) return emptyMap()
            return mapOf(
                "raw_config_length" to config.size,
                "raw_config_hex" to config.joinToString("") { "%02x".format(it) },
            )
        }

        private fun commonProperties(context: Context): Map<String, Any?> {
            val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            return mapOf(
                "platform" to "android",
                "app_version" to packageInfo.versionName,
            )
        }

        private fun nonNullProperties(properties: Map<String, Any?>): Map<String, Any> =
            properties.mapNotNull { (key, value) ->
                value?.let { key to it }
            }.toMap()

        private fun diagnosticDistinctId(context: Context): String {
            val prefs = context.getSharedPreferences(DIAGNOSTIC_PREFS, Context.MODE_PRIVATE)
            prefs.getString(DIAGNOSTIC_DISTINCT_ID_KEY, null)?.let { return it }
            val distinctId = "android-${UUID.randomUUID()}"
            prefs.edit().putString(DIAGNOSTIC_DISTINCT_ID_KEY, distinctId).apply()
            return distinctId
        }

        private fun sanitize(properties: Map<String, Any?>): Map<String, Any?> =
            properties.filterKeys { key ->
                !key.contains("latitude", ignoreCase = true) &&
                    !key.contains("longitude", ignoreCase = true)
            }.mapValues { (_, value) ->
                when (value) {
                    is String, is Number, is Boolean, null -> value
                    else -> value.toString()
                }
            }
    }
}

private object NoopDiagnosticSink : DiagnosticSink {
    override fun capture(eventName: String, properties: Map<String, Any?>) = Unit
    override fun flush() = Unit
}

private object PostHogDiagnosticSink : DiagnosticSink {
    override fun capture(eventName: String, properties: Map<String, Any?>) {
        val postHogProperties = properties.mapNotNull { (key, value) ->
            value?.let { key to it }
        }.toMap()
        PostHog.capture(eventName, properties = postHogProperties)
    }

    override fun flush() {
        PostHog.flush()
    }
}

internal fun newOperationId(): String = UUID.randomUUID().toString()
