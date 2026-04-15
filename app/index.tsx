import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';

import { useBleStore } from '@/src/store/bleStore';
import { usePermissions } from '@/src/ble/usePermissions';
import { DeviceRow } from '@/src/components/DeviceRow';
import type { ScannedDevice } from '@/src/store/bleStore';

export default function ScanScreen() {
  const { status, request } = usePermissions();
  const { status: bleStatus, devices, startScan, stopScan } = useBleStore();

  // Request permissions on mount, then auto-start scan once granted
  useEffect(() => {
    void request();
  }, [request]);

  useEffect(() => {
    if (status === 'granted' && bleStatus === 'idle') {
      startScan();
    }
  }, [status, bleStatus, startScan]);

  // Clean up scan on unmount
  useEffect(() => {
    return () => stopScan();
  }, [stopScan]);

  const isScanning = bleStatus === 'scanning';

  const handleToggleScan = () => {
    if (isScanning) {
      stopScan();
    } else {
      startScan();
    }
  };

  const handleDevicePress = (device: ScannedDevice) => {
    stopScan();
    router.push(`/device/${device.id}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Permission denied banner */}
      {status === 'denied' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Bluetooth permission denied. Enable it in Settings to scan for devices.
          </Text>
          <TouchableOpacity onPress={() => void request()}>
            <Text style={styles.bannerAction}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Scan toggle button */}
      <TouchableOpacity
        style={[styles.scanButton, isScanning && styles.scanButtonActive]}
        onPress={handleToggleScan}
        disabled={status === 'denied'}
        activeOpacity={0.8}
      >
        {isScanning ? (
          <View style={styles.scanButtonInner}>
            <ActivityIndicator color="#111827" size="small" style={styles.spinner} />
            <Text style={styles.scanButtonText}>Stop Scanning</Text>
          </View>
        ) : (
          <Text style={styles.scanButtonText}>Scan for VESC Boards</Text>
        )}
      </TouchableOpacity>

      {/* Device list */}
      <FlatList<ScannedDevice>
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <DeviceRow
            id={item.id}
            name={item.name}
            rssi={item.rssi}
            onPress={() => handleDevicePress(item)}
          />
        )}
        ListEmptyComponent={
          isScanning ? (
            <Text style={styles.emptyText}>Looking for nearby VESC boards…</Text>
          ) : (
            <Text style={styles.emptyText}>No devices found. Tap Scan to search.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
    paddingHorizontal: 16,
  },
  banner: {
    backgroundColor: '#7f1d1d',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bannerText: {
    color: '#fca5a5',
    fontSize: 13,
    flex: 1,
  },
  bannerAction: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 13,
  },
  scanButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  scanButtonActive: {
    backgroundColor: '#6b7280',
  },
  scanButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  spinner: {
    marginRight: 4,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  list: {
    paddingBottom: 32,
  },
  emptyText: {
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 15,
  },
});
