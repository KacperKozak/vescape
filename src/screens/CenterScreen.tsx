import { View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'

import { FloatingBar } from '@/components/FloatingBar'
import { TelemetryView } from '@/components/TelemetryView'
import { routes } from '@/navigation/routes'
import type { Board } from '@/db/boards'

interface CenterScreenProps {
  activeBoard: Board | undefined
  bleStatus: string
  onStopScan: () => void
  onRetryConnect: () => void
}

export function CenterScreen({
  activeBoard,
  bleStatus,
  onStopScan,
  onRetryConnect,
}: CenterScreenProps) {
  const hasBle = !!activeBoard?.bleId

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
      <TelemetryView />
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
