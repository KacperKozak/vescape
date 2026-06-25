import { router } from 'expo-router'
import { RecordIcon, StopIcon } from 'phosphor-react-native'
import { useCallback } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { routes } from '@/navigation/routes'
import type { Board } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { theme } from '@/constants/theme'

interface FloatingBarProps {
  bleStatus: string
  activeBoard: Board | undefined
  onStopScan: () => void
  onRetryConnect: () => void
  bottomOffset?: number
}

const ALERT_CONFIG = {
  warning: {
    bg: theme.status.warning.bg,
    border: theme.status.warning.border,
    text: theme.status.warning.text,
    btnBg: theme.status.warning.color,
  },
  error: {
    bg: theme.status.error.bg,
    border: theme.status.error.border,
    text: theme.status.error.text,
    btnBg: theme.status.error.color,
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
  return status === 'connected'
}

function getStatusPill(
  status: string,
  scanStatus: string,
  board: Board | undefined,
  onStopScan: () => void,
  onRetryConnect: () => void,
): StatusPill | null {
  if (!board)
    return {
      kind: 'action',
      text: 'No board added',
      buttonText: 'Add',
      config: ALERT_CONFIG.warning,
      onPress: () => router.push(routes.addBoard),
    }
  if (!board.link)
    return {
      kind: 'action',
      text: 'Board not linked',
      buttonText: 'Link',
      config: ALERT_CONFIG.warning,
      onPress: () => router.push({ pathname: routes.addBoardScan, params: { boardId: board.id } }),
    }
  if (scanStatus === 'scanning' && status === 'idle')
    return {
      kind: 'spinner',
      text: 'Searching…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'discovering')
    return {
      kind: 'spinner',
      text: 'Discovering…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'subscribing')
    return {
      kind: 'spinner',
      text: 'Subscribing…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'waiting_for_telemetry')
    return {
      kind: 'spinner',
      text: 'Waiting for telemetry…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'reconnecting')
    return {
      kind: 'spinner',
      text: 'Reconnecting…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'rescanning')
    return {
      kind: 'spinner',
      text: 'Searching…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'disconnecting')
    return {
      kind: 'spinner',
      text: 'Disconnecting…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'connecting')
    return {
      kind: 'spinner',
      text: 'Connecting…',
      color: theme.palette.sky.color,
      onPress: onStopScan,
    }
  if (status === 'stale')
    return {
      kind: 'spinner',
      text: 'Telemetry stale',
      color: theme.status.error.color,
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
  bottomOffset = 16,
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
    if (!recording && !canToggleRecording(bleStatus)) return
    if (recording) {
      stop()
    } else {
      start()
    }
  }, [bleStatus, recording, start, stop])

  const pill = getStatusPill(bleStatus, scanStatus, activeBoard, onStopScan, onRetryConnect)

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]} pointerEvents="box-none">
      {pill?.kind === 'spinner' && (
        <View
          style={[styles.pill, { borderColor: pill.color + '55' }]}
          testID="floating-bar-status"
        >
          <ActivityIndicator size="small" color={pill.color} />
          <Text style={[styles.pillText, { color: pill.color }]} numberOfLines={1}>
            {pill.text}
          </Text>
          <Pressable style={styles.pillButton} onPress={pill.onPress} testID="floating-bar-cancel">
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
          testID="floating-bar-connect"
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
        disabled={!recording && !canToggleRecording(bleStatus)}
        onPress={toggleRecord}
        testID="floating-bar-record"
      >
        {recording ? (
          <StopIcon size={22} color={theme.palette.slate.textPrimary} weight="fill" />
        ) : (
          <RecordIcon size={22} color={theme.status.error.color} weight="fill" />
        )}
        <Text style={[styles.fabLabel, recording && styles.fabLabelActive]}>
          {recording ? 'STOP' : 'REC'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
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
    backgroundColor: theme.palette.slate.surfaceDeep,
    shadowColor: theme.palette.mono.black,
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
    color: theme.palette.slate.textPrimary,
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.status.error.color,
    gap: 8,
  },
  fabActive: {
    backgroundColor: theme.status.error.color,
    borderColor: theme.status.error.color,
  },
  fabDisabled: {
    opacity: 0.45,
  },
  fabLabel: {
    color: theme.status.error.color,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  fabLabelActive: {
    color: theme.palette.slate.textPrimary,
  },
})
