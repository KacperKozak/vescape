import { useEffect } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { useBleStore } from '@/store/bleStore'
import { usePermissions } from '@/ble/usePermissions'
import { DeviceRow } from '@/components/DeviceRow'
import { routes } from '@/navigation/routes'
import type { ScannedDevice } from '@/store/bleStore'

export default function AddBoardScanScreen() {
  const { boardId, step } = useLocalSearchParams<{ boardId?: string; step?: string }>()
  const { status, request } = usePermissions()
  const { devices, error, startScan, stopScan, isScanning } = useBleStore(
    useShallow((s) => ({
      devices: s.devices,
      error: s.error,
      startScan: s.startScan,
      stopScan: s.stopScan,
      isScanning: s.scanStatus === 'scanning',
    })),
  )

  useEffect(() => {
    void request()
  }, [request])

  useEffect(() => {
    if (status === 'granted') {
      startScan()
    }
    return () => stopScan()
  }, [status, startScan, stopScan])

  const handleSelect = (device: ScannedDevice) => {
    stopScan()
    if (boardId) {
      router.push({
        pathname: routes.editBoard,
        params: { boardId, bleId: device.id, bleName: device.name },
      })
    } else {
      router.push({
        pathname: routes.addBoard,
        params: { step: step ?? '1', bleId: device.id, bleName: device.name },
      })
    }
  }

  const handleSkip = () => {
    stopScan()
    if (boardId) {
      router.push({ pathname: routes.editBoard, params: { boardId } })
      return
    }
    router.push({ pathname: routes.addBoard, params: { step: step ?? '1' } })
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <DeviceRow
            id={item.id}
            name={item.name}
            rssi={item.rssi}
            onPress={() => handleSelect(item)}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            {isScanning && <ActivityIndicator color="#3b82f6" style={styles.spinner} />}
            <Text style={styles.subtitle}>
              {status === 'denied'
                ? 'Bluetooth permission required'
                : error
                  ? error
                  : isScanning
                    ? 'Scanning for nearby boards…'
                    : 'No boards found nearby'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !isScanning ? null : (
            <Text style={styles.empty}>Boards will appear here as they are found</Text>
          )
        }
      />

      <Pressable style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip pairing for now</Text>
      </Pressable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  list: {
    padding: 16,
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  spinner: {
    marginRight: 4,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
  },
  empty: {
    color: '#4b5563',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  skipButton: {
    margin: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 10,
  },
  skipText: {
    color: '#9ca3af',
    fontSize: 15,
    fontWeight: '600',
  },
})
