import { useCallback, useEffect, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';

export type PermissionStatus = 'unknown' | 'granted' | 'denied';

/**
 * Request BLE runtime permissions on Android 12+ (API 31+).
 * On iOS the permission is handled by the Info.plist string injected by the
 * react-native-ble-plx Expo config plugin — no runtime request is needed.
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
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        // ACCESS_FINE_LOCATION is required for BLE scanning on API < 31
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(results).every(
        (r) => r === PermissionsAndroid.RESULTS.GRANTED,
      );
      setStatus(allGranted ? 'granted' : 'denied');
    } catch {
      setStatus('denied');
    }
  }, []);

  // Auto-request on mount
  useEffect(() => {
    void request();
  }, [request]);

  return { status, request };
}
