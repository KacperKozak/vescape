import { useRef } from 'react'
import { ActivityIndicator, View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'

import { CenterMap, type CenterMapHandle } from '@/screens/center/CenterMap'
import { CenterOverlays } from '@/screens/center/CenterOverlays'
import { useCenterScreenController } from '@/screens/center/useCenterScreenController'
import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'

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
  const controller = useCenterScreenController({ mapRef })
  const hasBle = !!activeBoard?.bleId

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
        liveLocations={controller.liveLocations}
        rideGpsSamples={controller.sessionGpsSamples}
        rideMarkers={controller.sessionMarkers}
        historyActive={controller.historyActive}
        mapStyleKey={controller.mapStyleKey}
        rotationLocked={controller.rotationLocked}
        perspectiveEnabled={controller.perspectiveEnabled}
        onPerspectiveChange={controller.setPerspectiveEnabled}
        onHeadingChange={controller.setHeading}
        onMapFocus={controller.handleMapFocus}
        onLongPressTarget={controller.setTargetLocation}
        targetLocation={controller.targetLocation}
        onClearTarget={controller.clearTargetLocation}
        seekPosition={controller.seekGpsPosition}
      />
      <CenterOverlays
        mode={controller.mode}
        mapRef={mapRef}
        board={{
          boards,
          activeBoardId,
          activeBoard,
          bleStatus,
          recordDebugSession,
          onStopScan,
          onRetryConnect,
          onSelectBoard,
          onAddBoard,
          onToggleRecordDebug,
        }}
        map={{
          heading: controller.heading,
          rotationLocked: controller.rotationLocked,
          perspectiveEnabled: controller.perspectiveEnabled,
          targetLocation: controller.targetLocation,
          clearTargetLocation: controller.clearTargetLocation,
          mapStyleKey: controller.mapStyleKey,
          setMapStyleKey: controller.setMapStyleKey,
          setRotationLocked: controller.setRotationLocked,
          exitMapFocus: controller.exitMapFocus,
        }}
        history={{
          enterHistoryMode: controller.enterHistoryMode,
          selectedSession: controller.selectedSession,
          sessionSamples: controller.sessionSamples,
          previousRide: controller.previousRide,
          nextRide: controller.nextRide,
          loadingSession: controller.loadingSession,
          historyLoading: controller.historyLoading,
          historyHasMore: controller.historyHasMore,
          historyError: controller.historyError,
          sessions: controller.sessions,
          historySheetVisible: controller.historySheetVisible,
          setHistorySheetVisible: controller.setHistorySheetVisible,
          selectSession: controller.selectSession,
          loadMoreHistory: controller.loadMoreHistory,
          selectRide: controller.selectRide,
          exitHistory: controller.exitHistory,
          removeSession: controller.removeSession,
          onSeek: controller.onSeek,
        }}
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
