import { useCallback, useEffect, useRef, useState } from 'react'
import { BackHandler, ToastAndroid, View, Text, Pressable, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ClockCounterClockwiseIcon, LightningIcon, MapPinIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useSettingsStore } from '@/store/settingsStore'
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
  const autoConnectAttemptedBoardRef = useRef<string | null>(null)
  const load = useBoardStore((s) => s.load)
  const { activeBoardId, boardsLoaded } = useBoardStore(
    useShallow((s) => ({ activeBoardId: s.activeBoardId, boardsLoaded: s.hasLoaded })),
  )
  const startGpsTracking = useBleStore((s) => s.startGpsTracking)
  const { status: permStatus, request } = usePermissions()

  const { autoConnect, settingsLoaded, loadSettings } = useSettingsStore(
    useShallow((s) => ({
      autoConnect: s.autoConnect,
      settingsLoaded: s.loaded,
      loadSettings: s.load,
    })),
  )

  const connection = useBoardConnection()
  const { bleStatus, handleRetryConnect } = connection

  useBleAppLifecycle()

  useEffect(() => {
    void load()
    void loadSettings()
  }, [load, loadSettings])

  useEffect(() => {
    void request()
  }, [request])

  useEffect(() => {
    if (permStatus === 'granted') {
      startGpsTracking()
    }
  }, [permStatus, startGpsTracking])

  useEffect(() => {
    if (!activeBoardId) {
      autoConnectAttemptedBoardRef.current = null
      return
    }
    if (!autoConnect) {
      autoConnectAttemptedBoardRef.current = null
      return
    }
    if (!boardsLoaded || !settingsLoaded || !connection.nativeStateReady) return
    if (permStatus !== 'granted') return
    if (autoConnectAttemptedBoardRef.current === activeBoardId) return
    if (bleStatus !== 'idle' && bleStatus !== 'error') return

    autoConnectAttemptedBoardRef.current = activeBoardId
    handleRetryConnect()
  }, [
    activeBoardId,
    autoConnect,
    bleStatus,
    boardsLoaded,
    connection.nativeStateReady,
    handleRetryConnect,
    permStatus,
    settingsLoaded,
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
        recordDebugSession={connection.recordDebugSession}
        inlineItems={connection.inlineItems}
        menuItems={connection.menuItems}
        onSelectBoard={connection.handleSelectBoard}
        onAddBoard={connection.handleAddBoard}
        onToggleRecordDebug={() => connection.setRecordDebugSession(!connection.recordDebugSession)}
      />

      <LiveStatusBar />
      {!connection.nativeStateReady && (
        <View style={styles.restoringBar}>
          <Text style={styles.restoringText}>Restoring native state...</Text>
          {/* I've never seen this? */}
        </View>
      )}

      <View style={styles.pagerWrap}>
        <MainPager ref={pagerRef} page={page} onPageChange={setPage}>
          <HistoryScreen key="history" />
          <CenterScreen
            key="center"
            activeBoard={connection.activeBoard}
            boardsLoaded={boardsLoaded}
            bleStatus={connection.bleStatus}
            onStopScan={connection.handleCancel}
            onRetryConnect={connection.handleRetryConnect}
          />
          <MapScreen key="map" active={page === 2} />
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
  restoringBar: {
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  restoringText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
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
