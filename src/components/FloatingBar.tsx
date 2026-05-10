import { RecordIcon, StopCircleIcon } from 'phosphor-react-native'
import { useCallback } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import type { Board } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { theme } from '@/constants/theme'

interface FloatingBarProps {
  bleStatus: string
  activeBoard: Board | undefined
  onStopScan: () => void
  onRetryConnect: () => void
}

const ALERT_CONFIG = {
  warning: {
    bg: theme.warning.bg,
    border: theme.warning.border,
    text: theme.warning.text,
    btnBg: theme.warning.color,
  },
  error: {
    bg: theme.error.bg,
    border: theme.error.border,
    text: theme.error.text,
    btnBg: theme.error.color,
  },
} as const

type SpinnerPill = { kind: 'spinner'; text: string; color: string; onPress: () => void }
type ActionPill = {
  kind: 'action'
  text: string
  buttonText: string
  config: (typeof ALERT_CONFIG)[keyof typeof ALERT_CONFIG]
  onPress: () => void
}
type StatusPill = SpinnerPill | ActionPill

function canToggleRecording(status: string): boolean {
  return (
    status === 'connected' ||
    status === 'stale' ||
    status === 'reconnecting' ||
    status === 'waiting_for_telemetry'
  )
}

function getStatusPill(
  status: string,
  scanStatus: string,
  board: Board | undefined,
  onStopScan: () => void,
  onRetryConnect: () => void,
): StatusPill | null {
  if (!board?.bleId) return null
  if (scanStatus === 'scanning' && status === 'idle')
    return { kind: 'spinner', text: 'Searching…', color: '#3b82f6', onPress: onStopScan }
  if (status === 'discovering')
    return { kind: 'spinner', text: 'Discovering…', color: '#3b82f6', onPress: onStopScan }
  if (status === 'subscribing')
    return { kind: 'spinner', text: 'Subscribing…', color: '#3b82f6', onPress: onStopScan }
  if (status === 'waiting_for_telemetry')
    return {
      kind: 'spinner',
      text: 'Waiting for telemetry…',
      color: '#3b82f6',
      onPress: onStopScan,
    }
  if (status === 'reconnecting')
    return { kind: 'spinner', text: 'Reconnecting…', color: '#3b82f6', onPress: onStopScan }
  if (status === 'disconnecting')
    return { kind: 'spinner', text: 'Disconnecting…', color: '#3b82f6', onPress: onStopScan }
  if (status === 'connecting')
    return { kind: 'spinner', text: 'Connecting…', color: '#3b82f6', onPress: onStopScan }
  if (status === 'stale')
    return {
      kind: 'spinner',
      text: 'Telemetry stale',
      color: theme.error.color,
      onPress: onStopScan,
    }
  if (status === 'idle')
    return {
      kind: 'action',
      text: 'Board not connected',
      buttonText: 'Connect',
      config: ALERT_CONFIG.warning,
      onPress: onRetryConnect,
    }
  if (status === 'error')
    return {
      kind: 'action',
      text: 'Connection failed',
      buttonText: 'Retry',
      config: ALERT_CONFIG.error,
      onPress: onRetryConnect,
    }
  return null
}

export function FloatingBar({
  bleStatus,
  activeBoard,
  onStopScan,
  onRetryConnect,
}: FloatingBarProps) {
  const { recording, scanStatus, start, stop } = useBleStore(
    useShallow((s) => ({
      recording: s.telemetryRecordingEnabled,
      scanStatus: s.scanStatus,
      start: s.startTelemetryRecording,
      stop: s.stopTelemetryRecording,
    })),
  )

  const toggleRecord = useCallback(() => {
    if (recording) {
      stop()
    } else {
      start()
    }
  }, [recording, start, stop])

  const pill = getStatusPill(bleStatus, scanStatus, activeBoard, onStopScan, onRetryConnect)

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      {pill?.kind === 'spinner' && (
        <View style={[styles.pill, { borderColor: pill.color + '55' }]}>
          <ActivityIndicator size="small" color={pill.color} />
          <Text style={[styles.pillText, { color: pill.color }]} numberOfLines={1}>
            {pill.text}
          </Text>
          <Pressable style={styles.pillButton} onPress={pill.onPress}>
            <Text style={styles.pillButtonText}>Cancel</Text>
          </Pressable>
        </View>
      )}
      {pill?.kind === 'action' && (
        <Pressable
          style={[
            styles.pill,
            { backgroundColor: pill.config.bg, borderColor: pill.config.border },
          ]}
          onPress={pill.onPress}
        >
          <Text style={[styles.pillText, { color: pill.config.text }]} numberOfLines={1}>
            {pill.text}
          </Text>
          <View style={[styles.pillButton, { backgroundColor: pill.config.btnBg }]}>
            <Text style={styles.pillButtonText}>{pill.buttonText}</Text>
          </View>
        </Pressable>
      )}

      <Pressable
        style={[
          styles.fab,
          recording && styles.fabActive,
          !canToggleRecording(bleStatus) && !recording && styles.fabDisabled,
        ]}
        onPress={toggleRecord}
      >
        {recording ? (
          <StopCircleIcon size={22} color="#052e16" weight="fill" />
        ) : (
          <RecordIcon size={22} color="#f1f5f9" weight="fill" />
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingLeft: 14,
    paddingRight: 4,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    backgroundColor: '#0f172a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 180,
  },
  pillButton: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButtonText: {
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
    borderColor: theme.error.color,
    gap: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fabActive: {
    backgroundColor: theme.gps.color,
    borderColor: theme.gps.border,
  },
  fabDisabled: {
    opacity: 0.45,
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
