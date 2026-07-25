import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { type SharedValue } from 'react-native-reanimated'
import { BellRingingIcon } from 'phosphor-react-native'
import { router } from 'expo-router'

import { Button } from '@/components/base/Button'
import { Text } from '@/components/base/Text'
import { type DualGaugeAlert } from '@/components/charts/gaugeAlert'
import { ConfirmModal } from '@/components/modals/ConfirmModal'
import { theme } from '@/constants/theme'
import { deriveBatteryConfig } from '@/modules/battery/lib'
import { type DerivedBatteryConfig } from '@/modules/battery/lib/types'
import { AlertPresetControl } from '@/modules/alerts/components/AlertPresetControl'
import { AlertRuleList } from '@/modules/alerts/components/AlertRuleList'
import { type MetricAlertsController } from '@/modules/alerts/hooks/useMetricAlerts'
import { routes } from '@/navigation/routes'
import { useBoardStore } from '@/modules/board/store/boardStore'

/** Structural mirror of the gauge hot-range span; keeps this module clear of the history module. */
interface MetricAlertsHotRange {
  start: number
  end: number
}

interface MetricAlertsProps {
  controller: MetricAlertsController | null
  unit: string
  /** Live telemetry value driving the gauge needle; absent renders the offline preview. */
  liveValue?: SharedValue<number | null>
  hotRange?: MetricAlertsHotRange | null
}

/**
 * A control's whole alert setup: preset levels with their gauge, or — once the rider hits edit —
 * their own rules. One block, one source of truth per metric, used by `/control` details and by
 * the add-board wizard through their respective {@link MetricAlertsController}s.
 *
 * A `null` controller means no Board: Alert Rules are board-owned (#254), so instead of controls
 * that would silently write nowhere, the block explains that and offers the way forward.
 */
export function MetricAlerts({ controller, unit, liveValue, hotRange }: MetricAlertsProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  const batteryConfig = useBatteryConfig(controller?.controlId)
  const customMarkers = useMemo<DualGaugeAlert[]>(
    () =>
      (controller?.rules ?? [])
        .filter((rule) => rule.enabled)
        .map((rule) => ({
          id: rule.id,
          threshold: rule.threshold,
          thresholdMax: rule.thresholdMax,
        })),
    [controller?.rules],
  )

  if (!controller) return <NoBoardNotice />

  const { metric, level, hasBatteryConfig } = controller
  // Battery presets are SoC %-based — a hard block, not a prompt, without a valid battery config.
  const batteryBlocked = metric === 'battery' && !hasBatteryConfig
  const isCustom = level === 'custom'

  return (
    <View style={styles.container}>
      {metric ? (
        <AlertPresetControl
          metric={metric}
          level={level}
          onLevelChange={controller.setLevel}
          liveValue={liveValue}
          boardTopSpeedKmh={controller.topSpeedKmh}
          hasBatteryConfig={hasBatteryConfig}
          customAlerts={customMarkers}
          hotRange={hotRange}
          disabled={batteryBlocked}
          onCustomize={controller.customize}
          onDiscardCustom={() => setConfirmingDiscard(true)}
        />
      ) : null}

      {batteryBlocked ? (
        <Text style={styles.note}>
          Battery presets need a valid battery configuration — they alert on state-of-charge %. Set
          up this board&apos;s battery to enable them.
        </Text>
      ) : null}

      {isCustom || !metric ? (
        <View style={styles.rules}>
          <AlertRuleList controller={controller} unit={unit} batteryConfig={batteryConfig} />
        </View>
      ) : null}

      <ConfirmModal
        visible={confirmingDiscard}
        title="Discard custom alerts"
        message={`Delete ${controller.rules.length} custom ${
          controller.rules.length === 1 ? 'alert' : 'alerts'
        } and return to presets?`}
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          controller.discardCustom()
          setConfirmingDiscard(false)
        }}
        onCancel={() => setConfirmingDiscard(false)}
      />
    </View>
  )
}

/** Battery rules are state-of-charge %, so the list and form need the board's derived config. */
function useBatteryConfig(controlId: string | undefined): DerivedBatteryConfig | null {
  const board = useBoardStore((s) => s.boards.find((b) => b.id === s.activeBoardId))
  return useMemo(() => {
    if (controlId !== 'battery') return null
    const derived = deriveBatteryConfig(board?.batteryConfig ?? null)
    return derived.warning == null ? derived : null
  }, [controlId, board?.batteryConfig])
}

function NoBoardNotice() {
  return (
    <View style={styles.noBoard}>
      <BellRingingIcon size={20} color={theme.palette.slate.textDim} weight="duotone" />
      <Text style={styles.noBoardText}>
        Alerts belong to a board — add yours to set up what it warns you about.
      </Text>
      <Button
        label="Add board"
        variant="secondary"
        size="sm"
        onPress={() => router.push(routes.addBoard)}
        style={styles.noBoardButton}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  rules: {
    gap: 8,
  },
  note: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  noBoard: {
    gap: 10,
    alignItems: 'flex-start',
  },
  noBoardText: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  noBoardButton: {
    alignSelf: 'flex-start',
  },
})
