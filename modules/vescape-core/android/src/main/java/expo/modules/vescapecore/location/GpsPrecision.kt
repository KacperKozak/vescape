package expo.modules.vescapecore.location

import android.location.LocationManager

// @parity /modules/vescape-core/ios/location/GpsPrecision.swift
internal const val MAX_RECORDING_ACCURACY_M = 20.0

internal fun isPreciseGpsFix(provider: String?, accuracyM: Double?): Boolean =
    provider == LocationManager.GPS_PROVIDER &&
        accuracyM != null &&
        accuracyM <= MAX_RECORDING_ACCURACY_M
