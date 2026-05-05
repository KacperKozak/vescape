import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, ToastAndroid, View, Text, Pressable, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ClockCounterClockwiseIcon, LightningIcon, MapPinIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { usePermissions } from '@/ble/usePermissions'
import { useBleAppLifecycle } from '@/hooks/useBleAppLifecycle'
import { useBoardConnection } from '@/hooks/useBoardConnection'
import { HistoryScreen } from '@/screens/HistoryScreen'
import { CenterScreen } from '@/screens/CenterScreen'
import { MapScreen } from '@/screens/MapScreen'
import { MainPager, type MainPagerHandle } from '@/components/MainPager'
import { TopBar } from '@/components/TopBar'
import { LiveStatusBar } from '@/components/LiveStatusBar'

const TABS = [
  { label: 'History', Icon: ClockCounterClockwiseIcon },
  { label: 'Board', Icon: LightningIcon },
  { label: 'Map', Icon: MapPinIcon },
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
      startTelemetryRecording: s.startTelemetryRecording, // no-arg now
    })),
  )
  const { status: permStatus, request } = usePermissions()

  const connection = useBoardConnection()

  useBleAppLifecycle()

  useEffect(() => {
    void load()
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
        startTelemetryRecording()
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
      <TopBar
        boards={connection.boards}
        activeBoardId={connection.activeBoardId}
        activeBoard={connection.activeBoard}
        replayBoardName={connection.replayBoardName}
        recordings={connection.recordings}
        recordDebugSession={connection.recordDebugSession}
        menuItems={connection.menuItems}
        onSelectBoard={connection.handleSelectBoard}
        onAddBoard={connection.handleAddBoard}
        onReplay={connection.handleReplay}
        onToggleRecordDebug={() => connection.setRecordDebugSession(!connection.recordDebugSession)}
      />

      <LiveStatusBar />

      <View style={styles.pagerWrap}>
        <MainPager ref={pagerRef} page={page} onPageChange={setPage}>
          <HistoryScreen key="history" />
          <CenterScreen
            key="center"
            activeBoard={connection.activeBoard}
            bleStatus={connection.bleStatus}
            onStopScan={connection.handleStopScan}
            onRetryConnect={connection.handleRetryConnect}
          />
          <MapScreen key="map" />
        </MainPager>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.tabBar}>
        {TABS.map(({ label, Icon }, i) => {
          const active = page === i
          const color = active ? '#f1f5f9' : '#64748b'
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
    backgroundColor: '#0f172a',
  },
  pagerWrap: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 4,
  },
  tabText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#f1f5f9',
  },
  tabIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3b82f6',
  },
})
