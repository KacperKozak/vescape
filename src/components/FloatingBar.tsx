import { Record, StopCircle } from 'phosphor-react-native'
import { useCallback } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import type { Board } from '@/db/boards'
import { useBleStore } from '@/store/bleStore'

interface FloatingBarProps {
  bleStatus: string
  activeBoard: Board | undefined
  onStopScan: () => void
  onRetryConnect: () => void
}

const ALERT_CONFIG = {
  scanning: { bg: '#0c1a2e', border: '#1e40af', text: '#60a5fa', btnBg: '#1d4ed8' },
  warning: { bg: '#451a03', border: '#92400e', text: '#fbbf24', btnBg: '#b45309' },
  error: { bg: '#1e293b', border: '#334155', text: '#94a3b8', btnBg: '#334155' },
} as const

function getAlert(
  status: string,
  board: Board | undefined,
  onStopScan: () => void,
  onRetryConnect: () => void,
) {
  if (!board?.bleId) return null
  if (status === 'scanning') {
    return {
      text: `Searching for ${board.name}`,
      buttonText: 'Stop',
      config: ALERT_CONFIG.scanning,
      onPress: onStopScan,
    }
  }
  if (status === 'idle') {
    return {
      text: 'Board not connected',
      buttonText: 'Connect',
      config: ALERT_CONFIG.warning,
      onPress: onRetryConnect,
    }
  }
  if (status === 'error') {
    return {
      text: 'Connection failed',
      buttonText: 'Retry',
      config: ALERT_CONFIG.error,
      onPress: onRetryConnect,
    }
  }
  return null
}

export function FloatingBar({
  bleStatus,
  activeBoard,
  onStopScan,
  onRetryConnect,
}: FloatingBarProps) {
  const { recording, start, stop } = useBleStore(
    useShallow((s) => ({
      recording: s.telemetryRecordingEnabled,
      start: s.startTelemetryRecording,
      stop: s.stopTelemetryRecording,
    })),
  )

  const toggleRecord = useCallback(() => {
    if (recording) {
      stop()
    } else {
      start({
        deviceId: activeBoard?.bleId ?? activeBoard?.id ?? null,
        deviceName: activeBoard?.name ?? null,
      })
    }
  }, [activeBoard?.bleId, activeBoard?.id, activeBoard?.name, recording, start, stop])

  const alert = getAlert(bleStatus, activeBoard, onStopScan, onRetryConnect)

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {alert && (
        <Pressable
          style={[
            styles.alertPill,
            { backgroundColor: alert.config.bg, borderColor: alert.config.border },
          ]}
          onPress={alert.onPress}
        >
          <Text style={[styles.alertText, { color: alert.config.text }]} numberOfLines={1}>
            {alert.text}
          </Text>
          <View style={[styles.alertButton, { backgroundColor: alert.config.btnBg }]}>
            <Text style={styles.alertButtonText}>{alert.buttonText}</Text>
          </View>
        </Pressable>
      )}

      <Pressable style={[styles.fab, recording && styles.fabActive]} onPress={toggleRecord}>
        {recording ? (
          <StopCircle size={22} color="#052e16" weight="fill" />
        ) : (
          <Record size={22} color="#f1f5f9" weight="fill" />
        )}
        <Text style={[styles.fabLabel, recording && styles.fabLabelActive]}>REC</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  alertPill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 150,
  },
  alertButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertButtonText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '800',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: '#ef4444',
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fabActive: {
    backgroundColor: '#22c55e',
    borderColor: '#16a34a',
  },
  fabLabel: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  fabLabelActive: {
    color: '#052e16',
  },
})
