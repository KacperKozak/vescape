import { useCallback, useState } from 'react';
import { Permission, PermissionsAndroid, Platform } from 'react-native';

export type PermissionStatus = 'unknown' | 'granted' | 'denied';

/**
 * Request BLE runtime permissions on Android 12+ (API 31+).
 * On iOS the app relies on static Info.plist usage descriptions, so no
 * runtime permission request is needed here.
 */
export function usePermissions(): {
  status: PermissionStatus;
  request: () => Promise<void>;
} {
  const [status, setStatus] = useState<PermissionStatus>('unknown');

  const request = useCallback(async () => {
    if (Platform.OS !== 'android') {
      setStatus('granted');
      return;
    }

    try {
      const permissions: Permission[] = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        // ACCESS_FINE_LOCATION is required for BLE scanning on API < 31
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];

      // POST_NOTIFICATIONS is required on Android 13+ to show the foreground
      // service notification while monitoring in background
      if (typeof Platform.Version === 'number' && Platform.Version >= 33) {
        permissions.push('android.permission.POST_NOTIFICATIONS' as Permission);
      }

      const results = await PermissionsAndroid.requestMultiple(permissions);

      const allGranted = Object.values(results).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED,
      );
      setStatus(allGranted ? 'granted' : 'denied');
    } catch {
      setStatus('denied');
    }
  }, []);

  return { status, request };
}
