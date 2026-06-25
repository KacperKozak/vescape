import { router } from 'expo-router'
import { RecordIcon, StopIcon } from 'phosphor-react-native'
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import {
  FloatingActionPill,
  FloatingBarFrame,
  FloatingStatusPill,
  type FloatingStatusPillModel,
} from '@/components/ui/controls/FloatingBar'
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
  const uiPill: FloatingStatusPillModel | null =
    pill?.kind === 'spinner'
      ? {
          kind: 'spinner',
          text: pill.text,
          color: pill.color,
          onPress: pill.onPress,
          testID: 'floating-bar-status',
          cancelTestID: 'floating-bar-cancel',
        }
      : pill
        ? {
            kind: 'action',
            text: pill.text,
            buttonText: pill.buttonText,
            bg: pill.config.bg,
            border: pill.config.border,
            textColor: pill.config.text,
            buttonBg: pill.config.btnBg,
            onPress: pill.onPress,
            testID: 'floating-bar-connect',
          }
        : null

  return (
    <FloatingBarFrame bottomOffset={bottomOffset}>
      {uiPill ? <FloatingStatusPill pill={uiPill} /> : null}
      <FloatingActionPill
        icon={recording ? StopIcon : RecordIcon}
        label={recording ? 'STOP' : 'REC'}
        active={recording}
        disabled={!recording && !canToggleRecording(bleStatus)}
        onPress={toggleRecord}
        testID="floating-bar-record"
      />
    </FloatingBarFrame>
  )
}
