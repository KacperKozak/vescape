package app.vescape.wear

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
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
 * Wrist layout for the live Watch Frame. Speed and duty are the two co-headline values, battery sits
 * second, motor/controller temps render small. Stale and disconnected are distinct faces so a frozen
 * value is never presented as live.
 */
@Composable
fun MirrorScreen() {
    val state by TelemetryState.mirrorState

    LaunchedEffect(Unit) {
        while (true) {
            delay(WATCH_FRAME_INTERVAL_MS)
            TelemetryState.refresh()
        }
    }

    MaterialTheme {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            when (state.status) {
                MirrorStatus.DISCONNECTED -> DisconnectedLayout()
                MirrorStatus.STALE -> FrameLayout(state.frame!!, stale = true)
                MirrorStatus.LIVE -> FrameLayout(state.frame!!, stale = false)
            }
        }
    }
}

@Composable
private fun FrameLayout(frame: WatchFrame, stale: Boolean) {
    val tint = if (stale) Color.Gray else Color.Unspecified
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        // Co-headline: speed and duty are the two most prominent values.
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = format(frame.speed, 1),
                style = MaterialTheme.typography.display1,
                color = tint,
            )
            Text(
                text = frame.duty?.let { "${format(it, 0)}%" } ?: "--",
                style = MaterialTheme.typography.display1,
                color = tint,
            )
        }
        Text(
            text = frame.battery?.let { "${format(it, 0)}%" } ?: "--",
            style = MaterialTheme.typography.title2,
            color = tint,
        )
        Text(
            text = "M ${temp(frame.motorTemp)}   C ${temp(frame.ctrlTemp)}",
            style = MaterialTheme.typography.caption2,
            color = tint,
            textAlign = TextAlign.Center,
        )
        if (stale) {
            Text(
                text = "STALE",
                style = MaterialTheme.typography.caption2,
                color = Color.Gray,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun DisconnectedLayout() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = "--",
            style = MaterialTheme.typography.display1,
            color = Color.Gray,
        )
        Text(
            text = "DISCONNECTED",
            style = MaterialTheme.typography.caption2,
            color = Color.Gray,
            textAlign = TextAlign.Center,
        )
    }
}

private fun format(value: Double, decimals: Int): String = String.format("%.${decimals}f", value)

private fun temp(value: Double?): String = value?.let { "${format(it, 0)}°" } ?: "--"
