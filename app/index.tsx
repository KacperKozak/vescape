import React, { useEffect } from 'react';
import {
  Alert,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { useBleStore } from '@/src/store/bleStore';
import { usePermissions } from '@/src/ble/usePermissions';
import { DeviceRow } from '@/src/components/DeviceRow';
import type { RecordingInfo, ScannedDevice } from '@/src/store/bleStore';

export default function ScanScreen() {
  const { status, request } = usePermissions();
  const {
    status: bleStatus,
    devices,
    recordings,
    recordDebugSession,
    startScan,
    stopScan,
    setRecordDebugSession,
    loadRecordings,
    deleteRecording,
    exportRecording,
  } = useBleStore();

  useEffect(() => {
    void request();
    void loadRecordings();
  }, [request, loadRecordings]);

  useEffect(() => {
    if (status === 'granted' && bleStatus === 'idle') {
      startScan();
    }
  }, [status, bleStatus, startScan]);

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
    router.push(`/device/${device.id}?name=${encodeURIComponent(device.name)}`);
  };

  const handleRecordingPress = (recording: RecordingInfo) => {
    stopScan();
    router.push(
      `/device/__recording__?recordingPath=${encodeURIComponent(recording.path)}&name=${encodeURIComponent(recording.deviceName)}`,
    );
  };

  const handleRecordingMenu = (recording: RecordingInfo) => {
    Alert.alert(recording.deviceName, recording.fileName, [
      {
        text: 'Download',
        onPress: () => {
          void exportRecording(recording).then((target) => {
            Alert.alert('Recording exported', target);
          });
        },
      },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void deleteRecording(recording),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
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

      <FlatList<ScannedDevice>
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <DeviceRow
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
        ListFooterComponent={
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.recordToggle}
              onPress={() => setRecordDebugSession(!recordDebugSession)}
              activeOpacity={0.8}
            >
              <View style={[styles.checkbox, recordDebugSession && styles.checkboxChecked]}>
                {recordDebugSession && <Text style={styles.checkboxMark}>x</Text>}
              </View>
              <Text style={styles.recordToggleText}>Record Debug BLE Session</Text>
            </TouchableOpacity>

            {recordings.length > 0 && (
              <View style={styles.recordingsSection}>
                <Text style={styles.sectionTitle}>Recordings</Text>
                {recordings.map((recording) => (
                  <TouchableOpacity
                    key={recording.path}
                    style={styles.recordingRow}
                    onPress={() => handleRecordingPress(recording)}
                    onLongPress={() => handleRecordingMenu(recording)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.recordingInfo}>
                      <Text style={styles.recordingName}>{recording.deviceName}</Text>
                      <Text style={styles.recordingMeta}>
                        {new Date(recording.startedAt).toLocaleString()} · {Math.ceil(recording.sizeBytes / 1024)} KB
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => handleRecordingMenu(recording)}
                    >
                      <Text style={styles.menuButtonText}>...</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
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
    marginBottom: 12,
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
  recordToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#6b7280',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  checkboxMark: {
    color: '#111827',
    fontWeight: '900',
    fontSize: 14,
  },
  recordToggleText: {
    color: '#d1d5db',
    fontSize: 14,
    fontWeight: '600',
  },
  recordingsSection: {
    marginBottom: 16,
  },
  footer: {
    paddingBottom: 8,
  },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  recordingRow: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 6,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recordingInfo: {
    flex: 1,
  },
  recordingName: {
    color: '#f9fafb',
    fontSize: 15,
    fontWeight: '700',
  },
  recordingMeta: {
    color: '#9ca3af',
    fontSize: 12,
    marginTop: 2,
  },
  menuButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuButtonText: {
    color: '#d1d5db',
    fontSize: 24,
    lineHeight: 24,
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
