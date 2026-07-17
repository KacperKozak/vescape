import { StyleSheet, View } from 'react-native'
import { ArrowCounterClockwiseIcon, EyeSlashIcon } from 'phosphor-react-native'
import type { BoardWarning } from 'vesc-ble'

import { Text } from '@/components/ui/base/Text'
import { IconButton } from '@/components/ui/base/IconButton'
import { SEVERITY_LABEL, severityStatus } from '@/constants/boardWarnings'
import { parseWarningDetail, warningDescription, warningTitle } from '@/lib/boardWarnings'
import { fmtTimeAgo } from '@/helpers/format'
import { theme } from '@/constants/theme'

interface BoardWarningRowProps {
  warning: BoardWarning
  /** Rider acknowledged this warning: grayed out here, excluded from the board warning indicator. */
  dismissed: boolean
  /** Toggle the dismissed (acknowledged) state, persisted on the board record. */
  onSetDismissed: (kind: string, dismissed: boolean) => void
}

/**
 * One row in the Board Warnings sheet: title, severity chip, description, first/last detected, and
 * payload-driven detail. Passive display only — no sounds or vibration. Data comes from the JS mirror
 * store; dismissing never touches the native warning registry, only the board's dismissed list.
 */
export function BoardWarningRow({ warning, dismissed, onSetDismissed }: BoardWarningRowProps) {
  const s = severityStatus(warning.severity)
  const description = warningDescription(warning.kind)
  const detail = parseWarningDetail(warning.kind, warning.payloadJson)

  return (
    <View
      style={[
        styles.card,
        { borderColor: dismissed ? theme.palette.slate.border : s.border },
        dismissed && styles.cardDismissed,
      ]}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={2}>
            {warningTitle(warning.kind)}
          </Text>
          <View
            style={[
              styles.chip,
              { backgroundColor: dismissed ? theme.palette.slate.surfaceDeep : s.bg },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: dismissed ? theme.palette.slate.textMuted : s.text },
              ]}
            >
              {dismissed ? 'Dismissed' : SEVERITY_LABEL[warning.severity]}
            </Text>
          </View>
        </View>
        <IconButton
          icon={dismissed ? ArrowCounterClockwiseIcon : EyeSlashIcon}
          size="sm"
          onPress={() => onSetDismissed(warning.kind, !dismissed)}
          accessibilityLabel={`${dismissed ? 'Restore' : 'Dismiss'} ${warningTitle(warning.kind)}`}
        />
      </View>

      {description != null && <Text style={styles.description}>{description}</Text>}

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
  cardDismissed: {
    opacity: 0.55,
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
  description: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
