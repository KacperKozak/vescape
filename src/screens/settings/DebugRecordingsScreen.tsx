import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import { RecordIcon, WarningIcon } from 'phosphor-react-native'

import { Button } from '@/components/ui/base/Button'
import { IconHero } from '@/components/ui/settings/IconHero'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { theme } from '@/constants/theme'
import { formatBytes } from '@/helpers/format'
import { useDebugRecordings } from '@/hooks/useDebugRecordings'

function formatCreatedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleString()
}

export function DebugRecordingsScreen() {
  const debug = useDebugRecordings()

  if (Platform.OS !== 'android') {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={RecordIcon}
          description="Raw BLE debug recording is available on Android only."
        />
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <IconHero
        icon={RecordIcon}
        description="Capture raw BLE packets, connection states, and location for diagnosis."
      />

      <SettingsSectionTitle>Capture</SettingsSectionTitle>
      <SettingsCard>
        <SettingsRow
          icon={RecordIcon}
          iconWeight="fill"
          iconColor={theme.error.color}
          label="Record future sessions"
          hint="Applies to every new board session until disabled"
          right={
            <Switch
              value={debug.enabled}
              onValueChange={debug.setEnabled}
              trackColor={{ false: theme.neutral.border, true: theme.error.border }}
              thumbColor={debug.enabled ? theme.error.color : theme.neutral.textMuted}
            />
          }
        />
      </SettingsCard>

      <View style={styles.warning}>
        <WarningIcon size={16} color={theme.warning.color} weight="fill" />
        <Text style={styles.warningText}>
          Captures location and raw BLE traffic. Files remain until app data is cleared.
        </Text>
      </View>

      <View style={styles.recordingsHeading}>
        <SettingsSectionTitle>Recordings</SettingsSectionTitle>
        <Pressable onPress={() => void debug.refresh()} disabled={debug.loading}>
          <Text style={styles.refreshText}>{debug.loading ? 'Loading...' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {debug.error ? (
        <Text style={styles.errorText} selectable>
          {debug.error}
        </Text>
      ) : null}
      {debug.loading ? (
        <ActivityIndicator color={theme.wheel.color} />
      ) : debug.recordings.length === 0 ? (
        <Text style={styles.emptyText}>No debug recordings yet.</Text>
      ) : (
        <SettingsCard>
          {debug.recordings.map((recording) => (
            <SettingsRow
              key={recording.name}
              icon={RecordIcon}
              iconColor={theme.wheel.color}
              label={recording.name}
              hint={`${formatCreatedAt(recording.createdAt)} · ${formatBytes(recording.sizeBytes)}`}
              right={
                <Button
                  label={debug.exportingName === recording.name ? 'Exporting...' : 'Export'}
                  size="sm"
                  variant="secondary"
                  loading={debug.exportingName === recording.name}
                  disabled={debug.exportingName != null}
                  onPress={() => void debug.exportRecording(recording)}
                />
              }
            />
          ))}
        </SettingsCard>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 16,
    gap: 8,
    backgroundColor: theme.neutral.bg,
  },
  warning: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.warning.bg,
  },
  warningText: {
    flex: 1,
    color: theme.warning.text,
    fontSize: 12,
    lineHeight: 17,
  },
  recordingsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshText: {
    color: theme.wheel.color,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: theme.error.color,
    fontSize: 12,
  },
  emptyText: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
})
