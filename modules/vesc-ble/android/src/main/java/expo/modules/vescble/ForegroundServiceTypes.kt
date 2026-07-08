package expo.modules.vescble

import android.content.pm.ServiceInfo

internal fun foregroundServiceType(
    boardActive: Boolean,
    gpsActive: Boolean,
    groupRideObserveActive: Boolean,
): Int {
    var type = 0
    if (boardActive) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    if (gpsActive) type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
    if (groupRideObserveActive && !boardActive && !gpsActive) {
        type = type or ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING
    }
    return type
}

internal fun foregroundServiceTypeForConnectedDevicePromotion(
    boardActive: Boolean,
    gpsActive: Boolean,
    groupRideObserveActive: Boolean,
): Int =
    foregroundServiceType(
        boardActive = boardActive,
        gpsActive = gpsActive,
        groupRideObserveActive = groupRideObserveActive,
    ) or ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
