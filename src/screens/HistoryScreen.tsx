import { useCallback } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { WarningCircleIcon } from 'phosphor-react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useShallow } from 'zustand/react/shallow'
import { HistoryMapPlayer } from '@/components/history/HistoryMapPlayer'
import { useHistoryStore } from '@/store/historyStore'

export function HistoryScreen() {
  const {
    sessions,
    selectedSession,
    sessionSamples,
    sessionGpsSamples,
    sessionMarkers,
    loadingSession,
    sessionTruncated,
    error,
    loadInitial,
    selectSession,
    removeSelectedSession,
  } = useHistoryStore(
    useShallow((s) => ({
      sessions: s.sessions,
      selectedSession: s.selectedSession,
      sessionSamples: s.sessionSamples,
      sessionGpsSamples: s.sessionGpsSamples,
      sessionMarkers: s.sessionMarkers,
      loadingSession: s.loadingSession,
      sessionTruncated: s.sessionTruncated,
      error: s.error,
      loadInitial: s.loadInitial,
      selectSession: s.selectSession,
      removeSelectedSession: s.removeSelectedSession,
    })),
  )

  useFocusEffect(
    useCallback(() => {
      void loadInitial()
    }, [loadInitial]),
  )

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorBar}>
          <WarningCircleIcon size={18} color="#fca5a5" weight="bold" />
          <Text style={styles.errorText} selectable>
            {error}
          </Text>
        </View>
      )}
      <HistoryMapPlayer
        sessions={sessions}
        selectedSession={selectedSession}
        sessionSamples={sessionSamples}
        sessionGpsSamples={sessionGpsSamples}
        sessionMarkers={sessionMarkers}
        loadingSession={loadingSession}
        sessionTruncated={sessionTruncated}
        onSelectSession={selectSession}
        onRemoveSelectedSession={removeSelectedSession}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  errorBar: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#451a1a',
    borderWidth: 1,
    borderColor: '#7f1d1d',
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  errorText: { color: '#fecaca', fontSize: 12, flex: 1 },
})
