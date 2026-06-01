import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated'
import { CaretRightIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'
import { addTelemetryListener, type TelemetryEvent } from 'vesc-ble'

import {
  PollIntervalPickerModal,
  formatPollInterval,
} from '@/components/domain/board/PollIntervalPickerModal'
import { liveTelemetryRuntime } from '@/lib/telemetry/liveTelemetryRuntime'
import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useSettingsStore } from '@/store/settingsStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useBleAppLifecycle } from '@/hooks/useBleAppLifecycle'
import { useBoardConnection } from '@/hooks/useBoardConnection'
import { interaction, theme } from '@/constants/theme'

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput)

const REFRESH_MS = 200

function ReanimatedValue({ value }: { value: SharedValue<number | null> }) {
  const props = useAnimatedProps(() => {
    const v = value.value
    const text = v != null ? v.toFixed(1) : '—'
    return { text, value: text }
  })

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      style={styles.valueText}
      animatedProps={props}
    />
  )
}

export default function MinimalTelemetryScreen() {
  const autoConnectAttemptedBoardRef = useRef<string | null>(null)
  const [pollPickerVisible, setPollPickerVisible] = useState(false)
  const [msgPerSec, setMsgPerSec] = useState(0)
  const countRef = useRef(0)
  const lastResetRef = useRef(performance.now())

  const load = useBoardStore((s) => s.load)
  const boards = useBoardStore((s) => s.boards)
  const activeBoardId = useBoardStore((s) => s.activeBoardId)
  const boardsLoaded = useBoardStore((s) => s.hasLoaded)
  const updateBoard = useBoardStore((s) => s.updateBoard)
  const activeBoard = boards.find((b) => b.id === activeBoardId)
  const pollIntervalMs = activeBoard?.pollIntervalMs ?? 100

  const startGpsTracking = useBleStore((s) => s.startGpsTracking)
  const { autoConnect, settingsLoaded, loadSettings } = useSettingsStore(
    useShallow((s) => ({
      autoConnect: s.autoConnect,
      settingsLoaded: s.loaded,
      loadSettings: s.load,
    })),
  )

  const { status: permStatus, request } = usePermissions()
  const connection = useBoardConnection()
  const { bleStatus, handleRetryConnect, handleCancel } = connection

  useBleAppLifecycle()

  useEffect(() => {
    void load()
    void loadSettings()
  }, [load, loadSettings])

  useEffect(() => {
    void request()
  }, [request])

  useEffect(() => {
    if (permStatus === 'granted') startGpsTracking()
  }, [permStatus, startGpsTracking])

  useEffect(() => {
    if (!activeBoardId || !autoConnect) {
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

  const handlePollIntervalChange = useCallback(
    (ms: number) => {
      if (!activeBoard) return
      void updateBoard({ ...activeBoard, pollIntervalMs: ms })
      setPollPickerVisible(false)
    },
    [activeBoard, updateBoard],
  )

  useEffect(() => {
    const sub = addTelemetryListener((_t: TelemetryEvent) => {
      countRef.current++
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      const now = performance.now()
      const elapsed = (now - lastResetRef.current) / 1000
      setMsgPerSec(elapsed > 0 ? countRef.current / elapsed : 0)
      countRef.current = 0
      lastResetRef.current = now
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  const { speedKmh, dutyPercent, batteryVoltage, avgLatencyMs } = liveTelemetryRuntime.values

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Raw Telemetry</Text>

      <Pressable
        style={({ pressed }) => [styles.pollRow, pressed && styles.pollRowPressed]}
        android_ripple={interaction.ripple}
        onPress={() => setPollPickerVisible(true)}
      >
        <Text style={styles.pollLabel}>
          {activeBoard ? formatPollInterval(pollIntervalMs) : 'No board'}
        </Text>
        <CaretRightIcon size={16} color={theme.neutral.textMuted} />
      </Pressable>

      <PollIntervalPickerModal
        visible={pollPickerVisible}
        pollIntervalMs={pollIntervalMs}
        onSelect={handlePollIntervalChange}
        onCancel={() => setPollPickerVisible(false)}
      />

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>{bleStatus}</Text>
        {bleStatus === 'idle' || bleStatus === 'error' ? (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pollRowPressed]}
            onPress={handleRetryConnect}
          >
            <Text style={styles.actionBtnText}>Connect</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pollRowPressed]}
            onPress={handleCancel}
          >
            <Text style={styles.actionBtnText}>Disconnect</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.metricsContainer}>
        <View style={styles.metricRow}>
          <Text style={styles.label}>Speed</Text>
          <View style={styles.valueRow}>
            <ReanimatedValue value={speedKmh} />
            <Text style={styles.unit}>km/h</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.label}>Duty</Text>
          <View style={styles.valueRow}>
            <ReanimatedValue value={dutyPercent} />
            <Text style={styles.unit}>%</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.label}>Battery</Text>
          <View style={styles.valueRow}>
            <ReanimatedValue value={batteryVoltage} />
            <Text style={styles.unit}>V</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <Text style={styles.label}>Latency</Text>
          <View style={styles.valueRow}>
            <ReanimatedValue value={avgLatencyMs} />
            <Text style={styles.unit}>ms</Text>
          </View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statsLabel}>Bridge events/sec</Text>
        <Text style={styles.statsValue}>{msgPerSec.toFixed(1)}</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
    padding: 24,
  },
  title: {
    color: theme.neutral.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
  },
  pollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  pollRowPressed: {
    backgroundColor: interaction.pressedBg,
  },
  pollLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  metricsContainer: {
    gap: 12,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  label: {
    color: theme.neutral.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  valueText: {
    color: theme.neutral.textPrimary,
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    padding: 0,
    minWidth: 80,
    textAlign: 'right',
  },
  unit: {
    color: theme.neutral.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  statusText: {
    color: theme.neutral.textMuted,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  actionBtn: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionBtnText: {
    color: theme.neutral.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 4,
  },
  statsLabel: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  statsValue: {
    color: theme.neutral.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
})
