import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { AlertPresetControl } from '@/modules/alerts/components/AlertPresetControl'
import { type AlertPresetLevel, type AlertPresetMetric } from '@/modules/alerts/lib/alertPresets'

/**
 * A single metric's Alert Preset level (labeled gauge preview + level slider), controlled by its
 * caller. Presets only: board settings edits any Board, including one that is not active, whose
 * rules the alerts store does not hold — so custom rules are edited from `/control` and the
 * add-board wizard, where the rule set on screen is the one being written.
 */
export function AlertPresetMetricSetup({
  metric,
  level,
  onLevelChange,
  topSpeedKmh,
  hasBatteryConfig,
}: {
  metric: AlertPresetMetric
  level: AlertPresetLevel
  onLevelChange: (level: AlertPresetLevel) => void
  topSpeedKmh: number
  hasBatteryConfig: boolean
}) {
  // Battery presets are SoC %-based — a hard block, not a prompt, without a valid battery config.
  const batteryBlocked = metric === 'battery' && !hasBatteryConfig

  return (
    <View style={styles.metric}>
      <AlertPresetControl
        metric={metric}
        level={level}
        onLevelChange={onLevelChange}
        boardTopSpeedKmh={topSpeedKmh}
        hasBatteryConfig={hasBatteryConfig}
        disabled={batteryBlocked}
      />
      {batteryBlocked ? (
        <Text style={styles.note}>
          Battery presets alert on state-of-charge % — set up this board&apos;s battery to enable
          them.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  metric: {
    gap: 8,
  },
  note: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
})
