package app.vescape.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import kotlin.math.cos
import kotlin.math.sin

/**
 * Wrist layout for the live Watch Frame. Three quarter-style gauges hug the watch rim — speed
 * top-left, duty top-right (almost touching at top center), battery across the bottom — styled like
 * the phone's DualGauge: thin gray guide, radial gradient fill from the centre, a strong rim line,
 * and a head tick at the current value. Temps + battery % sit inside. Stale dims every value so a
 * frozen reading is never shown as live. Ambient drops to a single dim speed hero.
 */
@Composable
fun MirrorScreen(isAmbient: Boolean = false, onKeepScreenAwakeChanged: (Boolean) -> Unit = {}) {
    val state by TelemetryState.mirrorState
    val keepScreenAwake = state.status == MirrorStatus.LIVE && !isAmbient

    DisposableEffect(keepScreenAwake) {
        onKeepScreenAwakeChanged(keepScreenAwake)
        onDispose { onKeepScreenAwakeChanged(false) }
    }

    LaunchedEffect(isAmbient) {
        while (true) {
            delay(if (isAmbient) AMBIENT_REFRESH_INTERVAL_MS else WATCH_FRAME_INTERVAL_MS)
            TelemetryState.refresh()
        }
    }

    MaterialTheme {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            when (state.status) {
                MirrorStatus.DISCONNECTED -> DisconnectedLayout(isAmbient)
                MirrorStatus.STALE -> if (isAmbient) AmbientLayout(state.frame!!) else FrameLayout(state.frame!!, muted = true)
                MirrorStatus.LIVE -> if (isAmbient) AmbientLayout(state.frame!!) else FrameLayout(state.frame!!, muted = false)
            }
        }
    }
}

@Composable
private fun FrameLayout(frame: WatchFrame, muted: Boolean) {
    val speedColor = if (muted) DimText else SpeedColor
    val dutyColor = if (muted) DimText else DutyColor
    val battColor = if (muted) DimText else batteryColor(frame.battery)

    Box(modifier = Modifier.fillMaxSize()) {
        // Three rim gauges on one shared screen-centred circle.
        Canvas(modifier = Modifier.fillMaxSize()) {
            val radius = size.minDimension / 2f - HEAD_W.toPx()
            val center = Offset(size.width / 2f, size.height / 2f)
            val speedFrac = (frame.speed / SPEED_MAX).toFloat().coerceIn(0f, 1f)
            val dutyFrac = ((frame.duty ?: 0.0) / 100.0).toFloat().coerceIn(0f, 1f)
            val battFrac = ((frame.battery ?: 0.0) / 100.0).toFloat().coerceIn(0f, 1f)

            // Speed: left (180°) -> top, sweep clockwise.
            drawGauge(center, radius, 180f, QUARTER_SWEEP, speedFrac, speedColor)
            // Duty: right (360°) -> top, sweep counter-clockwise.
            drawGauge(center, radius, 360f, -QUARTER_SWEEP, dutyFrac, dutyColor)
            // Battery: bottom arc, left (140°) -> right (40°) through 90°.
            drawGauge(center, radius, 140f, -BATTERY_SWEEP, battFrac, battColor)
        }

        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 6.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // ── Top: speed + duty values, sat lower so they clear the rim ──
            Row(
                modifier = Modifier.fillMaxWidth().weight(1f),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                GaugeValue(Modifier.weight(1f), format(frame.speed, 0), "km/h", speedColor)
                GaugeValue(Modifier.weight(1f), frame.duty?.let { format(it, 0) } ?: "--", "%", dutyColor)
            }

            // ── Bottom: temps over battery % (battery arc is on the rim behind) ──
            Column(
                modifier = Modifier.fillMaxWidth().weight(1f),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TempChip("M", frame.motorTemp, if (muted) DimText else MotorTempColor)
                    TempChip("C", frame.ctrlTemp, if (muted) DimText else CtrlTempColor)
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    text = frame.battery?.let { "${format(it, 0)}%" } ?: "--",
                    style = MaterialTheme.typography.title3,
                    color = battColor,
                )
            }
        }
    }
}

/**
 * One DualGauge-style arc. [sweepDeg] may be negative to flip fill direction. Layers: thin gray
 * guide, radial gradient wedge from the centre, a strong rim line, and a head tick at the tip.
 */
private fun DrawScope.drawGauge(
    center: Offset,
    radius: Float,
    startDeg: Float,
    sweepDeg: Float,
    fraction: Float,
    color: Color,
) {
    val topLeft = Offset(center.x - radius, center.y - radius)
    val arcSize = Size(radius * 2f, radius * 2f)
    val guide = Stroke(width = GUIDE_W.toPx(), cap = StrokeCap.Butt)
    val head = Stroke(width = HEAD_W.toPx(), cap = StrokeCap.Butt)

    // Thin gray guide across the whole arc.
    drawArc(GuideColor, startDeg, sweepDeg, false, topLeft, arcSize, style = guide)

    val sweptDeg = sweepDeg * fraction
    if (fraction > 0f) {
        // Radial gradient fill from the inside out (faint near rim).
        val brush = Brush.radialGradient(
            0f to Color.Transparent,
            0.6f to Color.Transparent,
            0.95f to color.copy(alpha = 0.12f),
            1f to color.copy(alpha = 0.32f),
            center = center,
            radius = radius,
        )
        drawArc(brush, startDeg, sweptDeg, true, topLeft, arcSize)

        // Strong rim line over the filled span.
        drawArc(color, startDeg, sweptDeg, false, topLeft, arcSize, style = head)
    }

    // Head tick at the current value — always drawn (sits at the start when fraction is 0).
    // Outer end reaches past the rim line's outer edge so the corner has no gap.
    val tipRad = Math.toRadians((startDeg + sweptDeg).toDouble())
    val inner = radius - radius * HEAD_LEN_RATIO
    val outer = radius + HEAD_W.toPx() / 2f
    val p1 = Offset(center.x + (inner * cos(tipRad)).toFloat(), center.y + (inner * sin(tipRad)).toFloat())
    val p2 = Offset(center.x + (outer * cos(tipRad)).toFloat(), center.y + (outer * sin(tipRad)).toFloat())
    drawLine(color, p1, p2, strokeWidth = HEAD_W.toPx(), cap = StrokeCap.Butt)
}

@Composable
private fun AmbientLayout(frame: WatchFrame) {
    Text(
        text = format(frame.speed, 0),
        style = MaterialTheme.typography.display1,
        color = AmbientText,
        textAlign = TextAlign.Center,
    )
}

@Composable
private fun DisconnectedLayout(isAmbient: Boolean) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = "--",
            style = MaterialTheme.typography.display1,
            color = if (isAmbient) AmbientText else DimText,
        )
        if (!isAmbient) {
            Text(
                text = "NO LINK",
                style = MaterialTheme.typography.caption2,
                color = DimText,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** Centered hero value + small unit, sat inside one of the top rim arcs. */
@Composable
private fun GaugeValue(modifier: Modifier, value: String, unit: String, color: Color) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(text = value, style = MaterialTheme.typography.title1, color = color)
        Text(text = unit, style = MaterialTheme.typography.caption3, color = SecondaryText)
    }
}

@Composable
private fun TempChip(label: String, value: Double?, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text = label, style = MaterialTheme.typography.caption3, color = color)
        Text(
            text = " ${temp(value)}",
            style = MaterialTheme.typography.caption1,
            color = PrimaryText,
        )
    }
}

private fun format(value: Double, decimals: Int): String = String.format("%.${decimals}f", value)

private fun temp(value: Double?): String = value?.let { "${format(it, 0)}°" } ?: "--"

private fun batteryColor(value: Double?): Color = when {
    value == null -> SecondaryText
    value < 20.0 -> WarningColor
    else -> BatteryColor
}

// Top rim gauges: 90° quarter-circles, small gap at top center. Battery: shallow bottom arc.
private const val TOP_GAP = 2f
private const val QUARTER_SWEEP = 90f - TOP_GAP
private const val BATTERY_SWEEP = 100f

private val GUIDE_W = 2.dp
private val HEAD_W = 3.dp
private const val HEAD_LEN_RATIO = 0.16f

private const val SPEED_MAX = 60.0

// Palette mirrors src/constants/theme.ts so the watch matches the phone app.
private val PrimaryText = Color(0xFFF1F5F9) // slate.textPrimary
private val SecondaryText = Color(0xFF94A3B8) // slate.textSecondary
private val DimText = Color(0xFF64748B) // slate.textMuted
private val GuideColor = Color(0xFF334155) // slate.border
private val SpeedColor = Color(0xFF38BDF8) // sky.color
private val DutyColor = Color(0xFF14B8A6) // teal.color
private val MotorTempColor = Color(0xFFEF4444) // red.color (motorTemp)
private val CtrlTempColor = Color(0xFFF97316) // orange.color (controllerTemp)
private val BatteryColor = Color(0xFF22C55E) // green.color
private val WarningColor = Color(0xFFF97316) // orange.color
private val AmbientText = Color(0xFFB8C4CE)

private const val AMBIENT_REFRESH_INTERVAL_MS = 60_000L
