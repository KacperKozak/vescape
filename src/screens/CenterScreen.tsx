import { useRef, useState } from 'react'
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useShallow } from 'zustand/react/shallow'

import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import { TopBar } from '@/screens/center/TopBar'
import { FloatingBar } from '@/components/FloatingBar'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useMapStore } from '@/store/mapStore'
import { type MapStyleKey } from '@/constants/mapStyles'

interface CenterScreenProps {
  activeBoard: Board | undefined
  activeBoardId: string | null
  boards: Board[]
  boardsLoaded: boolean
  bleStatus: string
  recordDebugSession: boolean
  onStopScan: () => void
  onRetryConnect: () => void
  onSelectBoard: (id: string) => void
  onAddBoard: () => void
  onToggleRecordDebug: () => void
}

export function CenterScreen({
  activeBoard,
  activeBoardId,
  boards,
  boardsLoaded,
  bleStatus,
  recordDebugSession,
  onStopScan,
  onRetryConnect,
  onSelectBoard,
  onAddBoard,
  onToggleRecordDebug,
}: CenterScreenProps) {
  const mapRef = useRef<CenterMapHandle>(null)
  const [mapStyleKey] = useState<MapStyleKey>('onedark')
  const [heading, setHeading] = useState(0)
  const [rotationLocked] = useState(false)
  const [perspectiveEnabled, setPerspectiveEnabled] = useState(true)
  const liveLocations = useBleStore((s) => s.liveLocationHistory)
  const { targetLocation, setTargetLocation, clearTargetLocation } = useMapStore(
    useShallow((s) => ({
      targetLocation: s.targetLocation,
      setTargetLocation: s.setTargetLocation,
      clearTargetLocation: s.clearTargetLocation,
    })),
  )
  const hasBle = !!activeBoard?.bleId
  void mapRef
  void heading

  if (!boardsLoaded) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.emptySubtitle}>Loading boards...</Text>
        </View>
      </View>
    )
  }

  if (!hasBle) {
    return (
      <View style={styles.container}>
        <View style={styles.empty}>
          {activeBoard ? (
            <>
              <Text style={styles.emptyTitle}>{activeBoard.name}</Text>
              <Text style={styles.emptySubtitle}>No device paired</Text>
              <Pressable
                style={styles.settingsButton}
                onPress={() =>
                  router.push({
                    pathname: routes.addBoardDetails,
                    params: { boardId: activeBoard.id },
                  })
                }
              >
                <Text style={styles.settingsButtonText}>Open Settings</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>No board added yet</Text>
              <Pressable style={styles.addButton} onPress={() => router.push(routes.addBoardScan)}>
                <Text style={styles.addButtonText}>+ Add your first board</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <CenterMap
        ref={mapRef}
        liveLocations={liveLocations}
        rideGpsSamples={[]}
        rideMarkers={[]}
        rideActive={false}
        mapStyleKey={mapStyleKey}
        rotationLocked={rotationLocked}
        perspectiveEnabled={perspectiveEnabled}
        onPerspectiveChange={setPerspectiveEnabled}
        onHeadingChange={setHeading}
        onMapFocus={() => undefined}
        onLongPressTarget={setTargetLocation}
        targetLocation={targetLocation}
        onClearTarget={clearTargetLocation}
      />
      <TopBar
        visible
        boards={boards}
        activeBoardId={activeBoardId}
        activeBoard={activeBoard}
        bleStatus={bleStatus}
        recordDebugSession={recordDebugSession}
        onSelectBoard={onSelectBoard}
        onAddBoard={onAddBoard}
        onToggleRecordDebug={onToggleRecordDebug}
        onDisconnect={onStopScan}
        onRetryConnect={onRetryConnect}
      />
      <FloatingBar
        bleStatus={bleStatus}
        activeBoard={activeBoard}
        onStopScan={onStopScan}
        onRetryConnect={onRetryConnect}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    color: '#94a3b8',
    fontSize: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
  },
  addButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#3b82f6',
    borderRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  settingsButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  settingsButtonText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 14,
  },
})
