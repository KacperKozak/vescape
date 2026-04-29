import { useEffect } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'

import { useBleStore } from '@/store/bleStore'
import { usePermissions } from '@/ble/usePermissions'
import { DeviceRow } from '@/components/DeviceRow'
import type { ScannedDevice } from '@/store/bleStore'

export default function AddBoardScanScreen() {
  const { boardId } = useLocalSearchParams<{ boardId?: string }>()
  const { status, request } = usePermissions()
  const { devices, startScan, stopScan } = useBleStore()
  const isScanning = useBleStore((s) => s.status === 'scanning')

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
    router.push({
      pathname: '/add-board/details',
      params: { boardId, bleId: device.id, bleName: device.name },
    })
  }

  const handleSkip = () => {
    stopScan()
    if (boardId) {
      router.push({ pathname: '/add-board/details', params: { boardId } })
      return
    }
    router.push('/add-board/details')
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <DeviceRow name={item.name} rssi={item.rssi} onPress={() => handleSelect(item)} />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            {isScanning && <ActivityIndicator color="#3b82f6" style={styles.spinner} />}
            <Text style={styles.subtitle}>
              {status === 'denied'
                ? 'Bluetooth permission required'
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
