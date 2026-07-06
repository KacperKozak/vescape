package expo.modules.vescble

import android.location.LocationManager

// @parity /modules/vesc-ble/ios/VescGpsPrecision.swift
internal const val MAX_RECORDING_ACCURACY_M = 20.0

internal fun isPreciseGpsFix(provider: String?, accuracyM: Double?): Boolean =
    provider == LocationManager.GPS_PROVIDER &&
        accuracyM != null &&
        accuracyM <= MAX_RECORDING_ACCURACY_M
