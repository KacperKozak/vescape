import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { AlertPresetControl } from '@/modules/alerts/components/AlertPresetControl'
import { type AlertPresetLevel, type AlertPresetMetric } from '@/modules/alerts/lib/alertPresets'

/**
 * A single metric's Alert Preset control (labeled gauge preview + Off/Safe/Normal/Pro slider),
 * controlled by its caller so it works both against the active Board (Settings) and a draft (the
 * add-board wizard). Offline preview — no live telemetry needle — so it works before a board
 * session exists. One metric per instance so the wizard can page through them one at a time.
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
        riderTopSpeedKmh={topSpeedKmh}
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
