import { StyleSheet, View } from 'react-native'
import { TrashIcon } from 'phosphor-react-native'
import type { BoardWarning } from 'vesc-ble'

import { Text } from '@/components/ui/base/Text'
import { IconButton } from '@/components/ui/base/IconButton'
import { SEVERITY_LABEL, severityStatus } from '@/constants/boardWarnings'
import { parseWarningDetail, warningTitle } from '@/lib/boardWarnings'
import { fmtTimeAgo } from '@/helpers/format'
import { theme } from '@/constants/theme'

interface BoardWarningRowProps {
  warning: BoardWarning
  /** Manually clear this warning. A still-true condition simply re-fires on next evaluation. */
  onClear: (kind: string) => void
}

/**
 * One row in the Board Warnings sheet: title, severity chip, first/last detected, and payload-driven
 * detail. Passive display only — no sounds or vibration. Data comes from the JS mirror store; the
 * clear action calls the native registry.
 */
export function BoardWarningRow({ warning, onClear }: BoardWarningRowProps) {
  const s = severityStatus(warning.severity)
  const detail = parseWarningDetail(warning.payloadJson)

  return (
    <View style={[styles.card, { borderColor: s.border }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {warningTitle(warning.kind)}
          </Text>
          <View style={[styles.chip, { backgroundColor: s.bg }]}>
            <Text style={[styles.chipText, { color: s.text }]}>
              {SEVERITY_LABEL[warning.severity]}
            </Text>
          </View>
        </View>
        <IconButton
          icon={TrashIcon}
          size="sm"
          destructive
          onPress={() => onClear(warning.kind)}
          accessibilityLabel={`Clear ${warningTitle(warning.kind)}`}
        />
      </View>

      <Text style={styles.detected}>
        First {fmtTimeAgo(warning.firstDetectedAtMs)} · Last {fmtTimeAgo(warning.lastDetectedAtMs)}
      </Text>

      {detail.length > 0 && (
        <View style={styles.detail}>
          {detail.map((entry) => (
            <View key={entry.label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{entry.label}</Text>
              <Text style={styles.detailValue}>{entry.value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.palette.slate.surface,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  headerText: {
    flex: 1,
    gap: 6,
  },
  title: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  detected: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
  },
  detail: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    flexShrink: 1,
  },
  detailValue: {
    color: theme.palette.slate.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
})
