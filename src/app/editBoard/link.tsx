import { useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router, useLocalSearchParams } from 'expo-router'
import {
  BluetoothIcon,
  CheckCircleIcon,
  CircleIcon,
  WarningCircleIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { BoardProbeProgress } from '@/components/domain/board/BoardProbeProgress'
import { Button } from '@/components/ui/base/Button'
import { formatBoardTransport } from '@/lib/boardTransport'
import { useBoardProbe } from '@/hooks/useBoardProbe'
import { routes } from '@/navigation/routes'
import { useBoardStore } from '@/store/boardStore'
import { theme } from '@/constants/theme'

export default function BoardLinkScreen() {
  const {
    boardId,
    bleId: routeBleId,
    bleName,
  } = useLocalSearchParams<{
    boardId: string
    bleId?: string
    bleName?: string
  }>()
  const { board, updateBoard } = useBoardStore(
    useShallow((s) => ({
      board: s.boards.find((b) => b.id === boardId),
      updateBoard: s.updateBoard,
    })),
  )

  // Capture the peripheral to probe once: a freshly-scanned device, else the
  // existing Board Link's peripheral (re-probe).
  const [bleId] = useState(() => routeBleId ?? board?.link?.bleId ?? null)
  const isReprobe = !routeBleId && board?.link != null

  // Re-probing clears the old Board Link as it starts; a new one is saved only
  // if probing succeeds, so a failed re-probe leaves the Board unlinked.
  const clearedRef = useRef(false)
  useEffect(() => {
    if (isReprobe && board && !clearedRef.current) {
      clearedRef.current = true
      void updateBoard({ ...board, link: null })
    }
  }, [isReprobe, board, updateBoard])

  const probe = useBoardProbe(bleId)
  const [saving, setSaving] = useState(false)

  const handleConfirm = async () => {
    if (!board || !probe.selectedLink) return
    setSaving(true)
    try {
      await updateBoard({ ...board, link: probe.selectedLink })
      router.back()
    } finally {
      setSaving(false)
    }
  }

  const chooseDevice = () => {
    router.push({ pathname: routes.addBoardScan, params: { boardId } })
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {bleId == null ? (
          <View style={styles.centered}>
            <BluetoothIcon size={40} color={theme.wheel.color} weight="duotone" />
            <Text style={styles.title}>No device to link</Text>
            <Text style={styles.statusText}>
              Choose a BLE peripheral to probe and link to this board.
            </Text>
          </View>
        ) : null}

        {bleId != null && probe.phase === 'probing' ? (
          <BoardProbeProgress progress={probe.progress} deviceName={bleName ?? bleId} />
        ) : null}

        {bleId != null && probe.phase === 'failed' ? (
          <View style={styles.centered}>
            <WarningCircleIcon size={40} color={theme.error.text} weight="duotone" />
            <Text style={styles.title}>No working transport</Text>
            <Text style={styles.statusText}>
              The probe found no Board Transport that returns telemetry. Nothing was saved.
            </Text>
          </View>
        ) : null}

        {probe.phase === 'picking' ? (
          <View style={styles.list}>
            <Text style={styles.title}>
              {probe.candidates.length === 1 ? 'Confirm transport' : 'Pick a transport'}
            </Text>
            {probe.candidates.map((candidate) => {
              const isSelected = candidate === probe.selected
              return (
                <Pressable
                  key={String(candidate)}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => probe.select(candidate)}
                  testID={`board-link-option-${candidate}`}
                >
                  {isSelected ? (
                    <CheckCircleIcon size={22} color={theme.wheel.color} weight="fill" />
                  ) : (
                    <CircleIcon size={22} color={theme.neutral.textMuted} weight="regular" />
                  )}
                  <Text style={styles.optionLabel}>{formatBoardTransport(candidate)}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {bleId == null ? (
          <Button label="Choose device" onPress={chooseDevice} testID="board-link-choose-device" />
        ) : probe.phase === 'failed' ? (
          <View style={styles.footerRow}>
            <Button
              style={styles.footerButton}
              label="Choose another"
              variant="secondary"
              onPress={chooseDevice}
              testID="board-link-choose-another"
            />
            <Button
              style={styles.footerButton}
              label="Retry"
              onPress={probe.retry}
              testID="board-link-retry"
            />
          </View>
        ) : (
          <Button
            label="Confirm"
            onPress={handleConfirm}
            disabled={probe.phase !== 'picking' || probe.selectedLink == null}
            loading={saving}
            testID="board-link-confirm"
          />
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    flexGrow: 1,
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  list: {
    gap: 8,
  },
  title: {
    color: theme.neutral.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusText: {
    color: theme.neutral.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    backgroundColor: theme.neutral.surface,
  },
  optionSelected: {
    borderColor: theme.wheel.color,
  },
  optionLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
  },
})
