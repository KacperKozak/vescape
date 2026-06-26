package app.vescape.wear

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay

/**
 * Wrist layout for the live Watch Frame. Speed is the glanceable hero value, duty and battery are
 * secondary, and motor/controller temps render small. Stale and disconnected are distinct states so
 * a frozen value is never presented as live.
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
        Box(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp), contentAlignment = Alignment.Center) {
            when (state.status) {
                MirrorStatus.DISCONNECTED -> DisconnectedLayout(isAmbient)
                MirrorStatus.STALE -> FrameLayout(state.frame!!, ConnectionStatus.STALE, isAmbient)
                MirrorStatus.LIVE -> FrameLayout(state.frame!!, ConnectionStatus.LIVE, isAmbient)
            }
        }
    }
}

@Composable
private fun FrameLayout(frame: WatchFrame, connectionStatus: ConnectionStatus, isAmbient: Boolean) {
    val muted = isAmbient || connectionStatus == ConnectionStatus.STALE
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(if (isAmbient) 1.dp else 3.dp),
    ) {
        ConnectionLabel(if (isAmbient) ConnectionStatus.AMBIENT else connectionStatus, isAmbient)
        MetricText(
            value = format(frame.speed, 0),
            unit = "km/h",
            color = if (muted) AmbientText else SpeedColor,
            hero = true,
            isAmbient = isAmbient,
        )
        if (!isAmbient) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MetricText(
                    value = frame.duty?.let { format(it, 0) } ?: "--",
                    unit = "%",
                    color = if (muted) DimText else DutyColor,
                    hero = false,
                    isAmbient = false,
                )
                MetricText(
                    value = frame.battery?.let { format(it, 0) } ?: "--",
                    unit = "%",
                    color = if (muted) DimText else batteryColor(frame.battery),
                    hero = false,
                    isAmbient = false,
                )
            }
            Text(
                text = "M ${temp(frame.motorTemp)}   C ${temp(frame.ctrlTemp)}",
                style = MaterialTheme.typography.caption2,
                color = if (muted) DimText else TempColor,
                textAlign = TextAlign.Center,
            )
        }
    }
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
        ConnectionLabel(if (isAmbient) ConnectionStatus.AMBIENT else ConnectionStatus.DISCONNECTED, isAmbient)
    }
}

@Composable
private fun MetricText(value: String, unit: String, color: Color, hero: Boolean, isAmbient: Boolean) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(if (hero) 4.dp else 2.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(
            text = value,
            style = if (hero) MaterialTheme.typography.display1 else MaterialTheme.typography.title2,
            color = color,
            textAlign = TextAlign.Center,
        )
        if (!isAmbient) {
            Text(
                text = unit,
                style = MaterialTheme.typography.caption2,
                color = SecondaryText,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun ConnectionLabel(status: ConnectionStatus, isAmbient: Boolean) {
    Text(
        text = status.label,
        style = MaterialTheme.typography.caption2,
        color = if (isAmbient) AmbientText else status.color,
        textAlign = TextAlign.Center,
    )
}

private enum class ConnectionStatus(val label: String, val color: Color) {
    LIVE("LIVE", LiveColor),
    STALE("STALE", DimText),
    DISCONNECTED("DISCONNECTED", DimText),
    AMBIENT("AOD", AmbientText),
}

private fun format(value: Double, decimals: Int): String = String.format("%.${decimals}f", value)

private fun temp(value: Double?): String = value?.let { "${format(it, 0)}°" } ?: "--"

private fun batteryColor(value: Double?): Color = when {
    value == null -> SecondaryText
    value < 20.0 -> WarningColor
    else -> BatteryColor
}

private val PrimaryText = Color(0xFFEAF2F8)
private val SecondaryText = Color(0xFF8FA4B5)
private val DimText = Color(0xFF6E7B86)
private val SpeedColor = Color(0xFF69D2FF)
private val DutyColor = Color(0xFF58E0C2)
private val BatteryColor = Color(0xFF7CDB8A)
private val TempColor = Color(0xFFFF9A5A)
private val WarningColor = Color(0xFFFFC65C)
private val LiveColor = Color(0xFF7CDB8A)
private val AmbientText = Color(0xFFB8C4CE)

private const val AMBIENT_REFRESH_INTERVAL_MS = 60_000L
