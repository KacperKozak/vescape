import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, ToastAndroid, View, Text, Pressable, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ClockCounterClockwise, Lightning, MapPin } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { usePermissions } from '@/ble/usePermissions'
import { useBleAppLifecycle } from '@/hooks/useBleAppLifecycle'
import { HistoryScreen } from '@/screens/HistoryScreen'
import { CenterScreen } from '@/screens/CenterScreen'
import { MapScreen } from '@/screens/MapScreen'
import { MainPager, type MainPagerHandle } from '@/components/MainPager'

const TABS = [
  { label: 'History', Icon: ClockCounterClockwise },
  { label: 'Board', Icon: Lightning },
  { label: 'Map', Icon: MapPin },
] as const

export default function MainScreen() {
  const [page, setPage] = useState(1)
  const pagerRef = useRef<MainPagerHandle>(null)
  const backPressedOnce = useRef(false)
  const load = useBoardStore((s) => s.load)
  const activeBoard = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))
  const { telemetryRecordingEnabled, startGpsTracking, startTelemetryRecording } = useBleStore(
    useShallow((s) => ({
      telemetryRecordingEnabled: s.telemetryRecordingEnabled,
      startGpsTracking: s.startGpsTracking,
      startTelemetryRecording: s.startTelemetryRecording,
    })),
  )
  const { status: permStatus, request } = usePermissions()

  useBleAppLifecycle()

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    void request()
  }, [request])

  useEffect(() => {
    if (permStatus === 'granted') {
      const context = {
        deviceId: activeBoard?.bleId ?? activeBoard?.id ?? null,
        deviceName: activeBoard?.name ?? null,
      }
      startGpsTracking(context)
      if (telemetryRecordingEnabled) {
        startTelemetryRecording(context)
      }
    }
  }, [
    activeBoard?.bleId,
    activeBoard?.id,
    activeBoard?.name,
    permStatus,
    startGpsTracking,
    startTelemetryRecording,
    telemetryRecordingEnabled,
  ])

  useFocusEffect(
    useCallback(() => {
      const handler = BackHandler.addEventListener('hardwareBackPress', () => {
        if (page !== 1) {
          pagerRef.current?.setPage(1)
          return true
        }
        if (backPressedOnce.current) {
          BackHandler.exitApp()
          return true
        }
        backPressedOnce.current = true
        ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT)
        setTimeout(() => {
          backPressedOnce.current = false
        }, 2000)
        return true
      })
      return () => handler.remove()
    }, [page]),
  )

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <MainPager ref={pagerRef} page={page} onPageChange={setPage}>
        <HistoryScreen key="history" />
        <CenterScreen key="center" />
        <MapScreen key="map" />
      </MainPager>

      <SafeAreaView edges={['bottom']} style={styles.tabBar}>
        {TABS.map(({ label, Icon }, i) => {
          const active = page === i
          const color = active ? '#f9fafb' : '#6b7280'
          return (
            <Pressable key={label} style={styles.tab} onPress={() => pagerRef.current?.setPage(i)}>
              <Icon size={22} color={color} weight={active ? 'fill' : 'regular'} />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              {active && <View style={styles.tabIndicator} />}
            </Pressable>
          )
        })}
      </SafeAreaView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tabText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#f9fafb',
  },
  tabIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3b82f6',
  },
})
