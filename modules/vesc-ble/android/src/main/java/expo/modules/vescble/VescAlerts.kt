package expo.modules.vescble

import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Handler
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import expo.modules.vescble.telemetry.AlertRuleEntity
import kotlin.math.abs

internal class VescAlertEngine {
    private val lastFiredAt = HashMap<String, Long>()

    fun resetDebounce() {
        lastFiredAt.clear()
    }

    fun evaluate(rules: List<AlertRuleEntity>, t: RefloatTelemetry): List<Map<String, Any?>> {
        if (rules.isEmpty()) return emptyList()
        val now = System.currentTimeMillis()
        val fired = mutableListOf<Map<String, Any?>>()
        for (rule in rules) {
            val id = rule.id
            val controlId = rule.controlId
            val threshold = rule.threshold
            val thresholdMax = rule.thresholdMax
            val soundType = rule.soundType
            val value = extractAlertValue(controlId, t) ?: continue
            val aboveDir = alertDirectionIsAbove(controlId)
            val triggered = if (aboveDir) value >= threshold else value <= threshold
            if (!triggered) continue
            val rangeDepth = alertRangeDepth(value, threshold, thresholdMax, aboveDir)
            val debounceMs = rangeDepth?.let { depth ->
                (1_000L - (650L * depth)).toLong()
            } ?: 10_000L
            if (now - (lastFiredAt[id] ?: 0L) < debounceMs) continue
            lastFiredAt[id] = now
            fired.add(mapOf(
                "ruleId" to id,
                "controlId" to controlId,
                "value" to value,
                "threshold" to threshold,
                "thresholdMax" to thresholdMax,
                "soundType" to soundType,
                "rangeDepth" to rangeDepth,
                "firedAt" to now,
            ))
        }
        return fired
    }

    private fun alertDirectionIsAbove(controlId: String): Boolean = controlId != "battery"

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

internal class VescAlertFeedback(
    private val context: Context,
    private val handler: Handler,
) {
    fun playTone(soundType: String, rangeDepth: Double?) {
        try {
            val tg = ToneGenerator(AudioManager.STREAM_ALARM, ToneGenerator.MAX_VOLUME)
            if (rangeDepth != null) {
                val durationMs = (140L + (760L * rangeDepth)).toInt()
                tg.startTone(alertTone(soundType), durationMs)
                handler.postDelayed({ tg.release() }, durationMs + 120L)
                return
            }
            val tone = alertTone(soundType)
            tg.startTone(tone, 450)
            handler.postDelayed({ tg.startTone(tone, 450) }, 500)
            handler.postDelayed({ tg.startTone(tone, 450) }, 1_000)
            handler.postDelayed({ tg.release() }, 1_600)
        } catch (e: Exception) {
            Log.w(VESC_SESSION_TAG, "Alert tone failed: ${e.message}")
        }
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

    companion object {
        fun preview(soundType: String) {
            val handler = Handler(contextMainLooper())
            try {
                val tg = ToneGenerator(AudioManager.STREAM_ALARM, ToneGenerator.MAX_VOLUME)
                val tone = alertTone(soundType)
                tg.startTone(tone, 350)
                if (soundType == "urgent") {
                    handler.postDelayed({ tg.startTone(tone, 350) }, 380)
                }
                handler.postDelayed({ tg.release() }, if (soundType == "urgent") 900 else 500)
            } catch (e: Exception) {
                Log.w(VESC_SESSION_TAG, "Alert preview failed: ${e.message}")
            }
        }

        private fun contextMainLooper() = android.os.Looper.getMainLooper()
    }
}

private fun alertTone(soundType: String): Int = when (soundType) {
    "urgent" -> ToneGenerator.TONE_CDMA_ABBR_ALERT
    "pulse"  -> ToneGenerator.TONE_PROP_BEEP
    else     -> ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD
}
