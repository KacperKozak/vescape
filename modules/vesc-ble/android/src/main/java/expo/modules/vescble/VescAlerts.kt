package expo.modules.vescble

import android.content.Context
import android.media.AudioManager
import android.media.AudioAttributes
import android.media.SoundPool
import android.os.Handler
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.tts.TextToSpeech
import android.util.Log
import expo.modules.vescble.telemetry.AlertRuleEntity
import expo.modules.vescble.telemetry.normalizeBatteryConfig
import kotlin.math.abs

private const val TTS_PREFIX = "tts:"

internal fun alertControlUnit(controlId: String): String =
    telemetryMetricByControlId[controlId]?.unit ?: ""

private fun formatAlertValue(value: Double, controlId: String): String =
    telemetryMetricByControlId[controlId]?.formatValue(value) ?: "%.0f".format(value)

internal fun renderAlertMessageTemplate(
    template: String,
    alert: FiredAlert,
    batteryPercent: Double?,
    onDiagnostic: ((String, Map<String, Any?>) -> Unit)? = null,
): String {
    val isBattery = alert.controlId == "battery"
    var text = template
    text = text.replace("{value}", formatAlertValue(alert.value, alert.controlId))
    text = text.replace("{threshold}", formatAlertValue(alert.threshold, alert.controlId))
    text = text.replace("{unit}", alertControlUnit(alert.controlId))
    if (isBattery) {
        text = text.replace("{voltage}", formatAlertValue(alert.value, alert.controlId))
        if (batteryPercent != null) {
            text = text.replace("{percent}", "%.0f".format(batteryPercent))
        } else if (text.contains("{percent}")) {
            onDiagnostic?.invoke(
                "alert_template_placeholder_unavailable",
                mapOf("placeholder" to "{percent}", "rule_id" to alert.ruleId, "control_id" to alert.controlId),
            )
            text = text.replace("{percent}", "")
        }
    } else {
        for (ph in listOf("{voltage}", "{percent}")) {
            if (text.contains(ph)) {
                onDiagnostic?.invoke(
                    "alert_template_placeholder_unavailable",
                    mapOf("placeholder" to ph, "rule_id" to alert.ruleId, "control_id" to alert.controlId),
                )
                text = text.replace(ph, "")
            }
        }
    }
    if (text.contains('{')) {
        val unknowns = Regex("\\{[^}]*\\}").findAll(text).map { it.value }.distinct().toList()
        if (unknowns.isNotEmpty()) {
            onDiagnostic?.invoke(
                "alert_template_unknown_placeholder",
                mapOf("placeholders" to unknowns.joinToString(","), "rule_id" to alert.ruleId),
            )
            text = text.replace(Regex("\\{[^}]*\\}"), "")
        }
    }
    return text.trim()
}

private fun ttsSampleAlert(soundType: String) = FiredAlert(
    ruleId = "preview",
    controlId = "battery",
    value = 48.0,
    threshold = 50.0,
    thresholdMax = null,
    soundType = soundType,
    rangeDepth = null,
    firedAt = System.currentTimeMillis(),
)

private fun ttsAlarmAttributes(): AudioAttributes = AudioAttributes.Builder()
    .setLegacyStreamType(AudioManager.STREAM_ALARM)
    .setUsage(AudioAttributes.USAGE_ALARM)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()

internal data class FiredAlert(
    val ruleId: String,
    val controlId: String,
    val value: Double,
    val threshold: Double,
    val thresholdMax: Double?,
    val soundType: String,
    val rangeDepth: Double?,
    val firedAt: Long,
) {
    fun toMap(): Map<String, Any?> = mapOf(
        "ruleId" to ruleId,
        "controlId" to controlId,
        "value" to value,
        "threshold" to threshold,
        "thresholdMax" to thresholdMax,
        "soundType" to soundType,
        "rangeDepth" to rangeDepth,
        "firedAt" to firedAt,
    )
}

internal class VescAlertEngine {
    private val lastFiredAt = HashMap<String, Long>()
    private val armedState = HashMap<String, Boolean>()

    fun resetDebounce() {
        lastFiredAt.clear()
        armedState.clear()
    }

    fun evaluate(
        rules: List<AlertRuleEntity>,
        t: RefloatTelemetry,
        batteryConfig: Map<String, Any?>? = null,
    ): List<FiredAlert> {
        if (rules.isEmpty()) return emptyList()
        val now = System.currentTimeMillis()
        val fired = mutableListOf<FiredAlert>()
        val batteryMargin = if (batteryConfig != null) batteryHysteresisMargin(batteryConfig) else null

        if (batteryMargin != null) {
            for (rule in rules) {
                if (rule.controlId == "battery" && rule.thresholdMax == null) {
                    if (armedState[rule.id] == false && t.batteryVoltage > rule.threshold + batteryMargin) {
                        armedState[rule.id] = true
                    }
                }
            }
        }

        for (rule in rules) {
            val value = extractAlertValue(rule.controlId, t) ?: continue
            val aboveDir = alertDirectionIsAbove(rule.controlId)
            val triggered = if (aboveDir) value >= rule.threshold else value <= rule.threshold
            if (!triggered) continue
            val rangeDepth = alertRangeDepth(value, rule.threshold, rule.thresholdMax, aboveDir)
            if (rangeDepth == null) {
                if (rule.controlId == "battery" && batteryMargin != null) {
                    if (armedState[rule.id] == false) continue
                    armedState[rule.id] = false
                } else {
                    if (now - (lastFiredAt[rule.id] ?: 0L) < 10_000L) continue
                    lastFiredAt[rule.id] = now
                }
            }
            fired.add(FiredAlert(
                ruleId = rule.id,
                controlId = rule.controlId,
                value = value,
                threshold = rule.threshold,
                thresholdMax = rule.thresholdMax,
                soundType = rule.soundType,
                rangeDepth = rangeDepth,
                firedAt = now,
            ))
        }
        return fired.sortedWith(
            compareBy<FiredAlert> { if (it.rangeDepth != null) 0 else 1 }
                .thenByDescending {
                    if (alertDirectionIsAbove(it.controlId)) it.threshold else -it.threshold
                }
        )
    }

    private fun batteryHysteresisMargin(config: Map<String, Any?>): Double? {
        val normalized = normalizeBatteryConfig(config) ?: return null
        return when (normalized["mode"] as? String) {
            "preset" -> {
                val seriesCount = (normalized["seriesCount"] as? Number)?.toInt() ?: return null
                0.1 * seriesCount
            }
            "manual" -> {
                val minV = (normalized["minVoltage"] as? Number)?.toDouble() ?: return null
                val maxV = (normalized["maxVoltage"] as? Number)?.toDouble() ?: return null
                (maxV - minV) * 0.03
            }
            else -> null
        }
    }

    private fun alertDirectionIsAbove(controlId: String): Boolean =
        telemetryMetricByControlId[controlId]?.alertAbove ?: true

    private fun alertRangeDepth(
        value: Double,
        threshold: Double,
        thresholdMax: Double?,
        aboveDir: Boolean,
    ): Double? {
        if (thresholdMax == null || thresholdMax == threshold) return null
        val span = if (aboveDir) thresholdMax - threshold else threshold - thresholdMax
        if (span <= 0.0) return null
        val depth = if (aboveDir) value - threshold else threshold - value
        return (depth / span).coerceIn(0.0, 1.0)
    }

    private fun extractAlertValue(controlId: String, t: RefloatTelemetry): Double? = when (controlId) {
        "speed"           -> abs(t.speed)
        "battery"         -> t.batteryVoltage
        "duty"            -> abs(t.dutyCycle) * 100.0
        "motor-temp"      -> t.tempMotor?.takeIf { it > 0 }
        "motor-current"   -> t.motorCurrent
        "controller-temp" -> t.tempMosfet
        "batt-current"    -> t.batteryCurrent
        "imu"             -> t.pitch
        "footpad"         -> t.adc1
        else              -> null
    }
}

internal data class AlertSoundPreset(
    val name: String,
    val uri: String,
    val category: String,
    val resId: Int,
) {
    fun toMap(): Map<String, Any> = mapOf(
        "name" to name,
        "uri" to uri,
        "category" to category,
    )
}

internal class VescAlertFeedback(
    private val context: Context,
    private val handler: Handler,
) {
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var ttsPendingText: String? = null

    private val soundPool = SoundPool.Builder()
        .setMaxStreams(8)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setLegacyStreamType(AudioManager.STREAM_ALARM)
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        )
        .build()
    private val soundIds = HashMap<Int, Int>()
    private val geigerLoops = HashMap<String, GeigerLoop>()

    init {
        for (preset in ALERT_SOUND_PRESETS) {
            soundIds[preset.resId] = soundPool.load(context, preset.resId, 1)
        }
    }

    fun speakMessage(text: String) {
        val existing = tts
        if (existing == null) {
            ttsPendingText = text
            tts = TextToSpeech(context) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    tts?.setAudioAttributes(ttsAlarmAttributes())
                    ttsReady = true
                    val pending = ttsPendingText
                    ttsPendingText = null
                    if (pending != null) speakNow(pending)
                } else {
                    Log.w(VESC_SESSION_TAG, "TTS init failed status=$status")
                }
            }
            return
        }
        if (!ttsReady) {
            ttsPendingText = text
            return
        }
        speakNow(text)
    }

    private fun speakNow(text: String) {
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vesc_alert")
    }

    fun playSingle(soundType: String) {
        try {
            val preset = resolveAlertPreset(soundType, ALERT_CATEGORY_SINGLE)
            playPreset(preset)
            handler.postDelayed({ playPreset(preset) }, 500)
            handler.postDelayed({ playPreset(preset) }, 1_000)
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Alert sound failed: ${e.message}")
        }
    }

    fun preview(soundType: String) {
        if (soundType.startsWith(TTS_PREFIX)) {
            val template = soundType.removePrefix(TTS_PREFIX)
            val text = renderAlertMessageTemplate(template, ttsSampleAlert(soundType), batteryPercent = 42.0)
            if (text.isNotEmpty()) speakMessage(text)
            return
        }
        try {
            playPreset(resolveAlertPreset(soundType, null))
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Alert preview failed: ${e.message}")
        }
    }

    fun updateGeiger(ruleId: String, soundType: String, rangeDepth: Double) {
        try {
            val depth = rangeDepth.coerceIn(0.0, 1.0)
            val existing = geigerLoops[ruleId]
            val tickPreset = resolveAlertPreset(soundType, ALERT_CATEGORY_GEIGER)
            if (depth >= 1.0) {
                existing?.runnable?.let { handler.removeCallbacks(it) }
                if (existing?.sustained == true) return
                existing?.streamId?.let { soundPool.stop(it) }
                val streamId = playPreset(tickPreset, loop = -1)
                geigerLoops[ruleId] = GeigerLoop(soundType, depth, sustained = true, streamId = streamId)
                return
            }

            if (existing?.sustained == true) {
                existing.streamId?.let { soundPool.stop(it) }
            }
            if (existing != null && !existing.sustained && existing.soundType == soundType) {
                existing.rangeDepth = depth
                return
            }
            existing?.runnable?.let { handler.removeCallbacks(it) }
            val loop = GeigerLoop(soundType, depth, sustained = false)
            val runnable = object : Runnable {
                override fun run() {
                    playPreset(tickPreset)
                    handler.postDelayed(this, geigerIntervalMs(loop.rangeDepth))
                }
            }
            loop.runnable = runnable
            geigerLoops[ruleId] = loop
            handler.post(runnable)
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Geiger sound failed: ${e.message}")
        }
    }

    fun stopGeiger(ruleId: String) {
        val loop = geigerLoops.remove(ruleId) ?: return
        loop.runnable?.let { handler.removeCallbacks(it) }
        loop.streamId?.let { soundPool.stop(it) }
    }

    fun stopAllGeiger() {
        for (ruleId in geigerLoops.keys.toList()) stopGeiger(ruleId)
    }

    fun release() {
        stopAllGeiger()
        soundPool.release()
        tts?.stop()
        tts?.shutdown()
        tts = null
        ttsReady = false
    }

    fun vibrate(rangeDepth: Double?) {
        try {
            val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (rangeDepth != null) {
                val durationMs = (90L + (260L * rangeDepth)).toLong()
                v.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE))
                return
            }
            v.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 450, 120, 450, 120, 650), -1))
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Vibrate failed: ${e.message}")
        }
    }

    private fun playPreset(preset: AlertSoundPreset, loop: Int = 0): Int {
        val soundId = soundIds[preset.resId] ?: return 0
        return soundPool.play(soundId, 1f, 1f, 1, loop, 1f)
    }

    private fun geigerIntervalMs(rangeDepth: Double): Long =
        (800L - (740L * rangeDepth.coerceIn(0.0, 1.0))).toLong().coerceIn(60L, 800L)

    private data class GeigerLoop(
        val soundType: String,
        var rangeDepth: Double,
        val sustained: Boolean,
        val streamId: Int? = null,
        var runnable: Runnable? = null,
    )

    companion object {
        fun preview(context: Context, soundType: String) {
            if (soundType.startsWith(TTS_PREFIX)) {
                val template = soundType.removePrefix(TTS_PREFIX)
                val text = renderAlertMessageTemplate(template, ttsSampleAlert(soundType), batteryPercent = 42.0)
                if (text.isEmpty()) return
                val handler = Handler(contextMainLooper())
                val holder = arrayOfNulls<TextToSpeech>(1)
                holder[0] = TextToSpeech(context) { status ->
                    if (status == TextToSpeech.SUCCESS) {
                        val t = holder[0] ?: return@TextToSpeech
                        t.setAudioAttributes(ttsAlarmAttributes())
                        t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "preview")
                        handler.postDelayed({ t.stop(); t.shutdown() }, 5_000)
                    }
                }
                return
            }
            val handler = Handler(contextMainLooper())
            val preset = resolveAlertPreset(soundType, null)
            val pool = SoundPool.Builder()
                .setMaxStreams(2)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setLegacyStreamType(AudioManager.STREAM_ALARM)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .build()
            try {
                pool.setOnLoadCompleteListener { soundPool, sampleId, status ->
                    if (status == 0) soundPool.play(sampleId, 1f, 1f, 1, 0, 1f)
                }
                pool.load(context, preset.resId, 1)
                handler.postDelayed({ pool.release() }, 1_000)
            } catch (e: Exception) {
                pool.release()
                Log.w(VESC_SESSION_TAG, "Alert preview failed: ${e.message}")
            }
        }

        private fun contextMainLooper() = android.os.Looper.getMainLooper()
    }
}

internal fun alertSoundPresetMaps(): List<Map<String, Any>> =
    ALERT_SOUND_PRESETS
        .filter { it.uri != "preset:sustained" }
        .map { it.toMap() }

private const val ALERT_CATEGORY_SINGLE = "single"
private const val ALERT_CATEGORY_GEIGER = "geiger"

private val ALERT_SOUND_PRESETS = listOf(
    AlertSoundPreset("Beep", "preset:beep", ALERT_CATEGORY_SINGLE, R.raw.alert_beep),
    AlertSoundPreset("Urgent", "preset:urgent", ALERT_CATEGORY_SINGLE, R.raw.alert_urgent),
    AlertSoundPreset("Notify", "preset:notify", ALERT_CATEGORY_SINGLE, R.raw.alert_notify),
    AlertSoundPreset("Tick", "preset:tick", ALERT_CATEGORY_GEIGER, R.raw.alert_tick),
    AlertSoundPreset("Hard Tick", "preset:tick_hard", ALERT_CATEGORY_GEIGER, R.raw.alert_tick_hard),
    AlertSoundPreset("Gamma", "preset:gamma", ALERT_CATEGORY_GEIGER, R.raw.alert_gamma),
    AlertSoundPreset("Sustained", "preset:sustained", ALERT_CATEGORY_GEIGER, R.raw.alert_sustained),
)

private fun resolveAlertPreset(soundType: String, category: String?): AlertSoundPreset {
    val key = when {
        soundType.startsWith("preset:") -> soundType.removePrefix("preset:")
        soundType.contains(":") -> null
        soundType == "default" -> "beep"
        soundType == "pulse" -> "notify"
        else -> soundType
    }
    val uri = key?.let { "preset:$it" }
    val preset = ALERT_SOUND_PRESETS.firstOrNull { it.uri == uri }
    if (preset != null && (category == null || preset.category == category)) return preset
    return when (category) {
        ALERT_CATEGORY_GEIGER -> ALERT_SOUND_PRESETS.first { it.uri == "preset:tick" }
        else -> ALERT_SOUND_PRESETS.first { it.uri == "preset:beep" }
    }
}
