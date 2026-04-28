import { useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useLocalSearchParams, router, useNavigation } from 'expo-router'

import { useBleStore } from '@/src/store/bleStore'
import { StatusPill } from '@/src/components/StatusPill'
import { TelemetryView } from '@/src/components/TelemetryView'

export default function TelemetryScreen() {
  const { id, name, recordingPath } = useLocalSearchParams<{
    id: string
    name?: string
    recordingPath?: string
  }>()
  const navigation = useNavigation()

  const { status, error, connect, replayRecording, disconnect } = useBleStore()

  useEffect(() => {
    if (recordingPath) {
      void replayRecording({
        id: recordingPath,
        path: recordingPath,
        fileName: recordingPath.split('/').pop() ?? 'recording.jsonl',
        deviceName: name ? decodeURIComponent(name) : 'Recorded Session',
        startedAt: Date.now(),
        sizeBytes: 0,
      })
    } else if (id) {
      void connect(id, name ? decodeURIComponent(name) : undefined)
    }
    return () => {
      void disconnect()
    }
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, name, recordingPath])

  const boardName = name ? decodeURIComponent(name) : id

  useEffect(() => {
    navigation.setOptions({
      title: status === 'connected' ? boardName : 'Connecting…',
      headerRight: () => <StatusPill status={status} style={{ marginRight: 8 }} />,
    })
  }, [status, navigation, boardName])

  return (
    <View style={styles.container}>
      {status === 'error' && (
        <View style={styles.centerContent}>
          <Text style={styles.disconnectedIcon}>{error === 'Board disconnected' ? '⚡' : '✕'}</Text>
          <Text style={styles.disconnectedTitle}>
            {error === 'Board disconnected' ? 'Board turned off' : 'Connection failed'}
          </Text>
          {error && error !== 'Board disconnected' && <Text style={styles.errorText}>{error}</Text>}
          <TouchableOpacity style={styles.retryButton} onPress={() => router.back()}>
            <Text style={styles.retryText}>← Back to Scan</Text>
          </TouchableOpacity>
        </View>
      )}
      {status !== 'error' && <TelemetryView />}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
    flex: 1,
  },
  disconnectedIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  disconnectedTitle: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
  },
  retryText: {
    color: '#60a5fa',
    fontWeight: '600',
    fontSize: 15,
  },
})
