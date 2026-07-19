import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import { Text } from '@/components/base/Text'
import { PackageIcon, RecordIcon, WarningIcon } from 'phosphor-react-native'
import { router } from 'expo-router'

import { Button } from '@/components/base/Button'
import { IconHero } from '@/components/settings/IconHero'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/settings/SettingsSectionTitle'
import { theme } from '@/constants/theme'
import { formatBytes } from '@/helpers/format'
import { useDebugRecordings } from '@/modules/history/hooks/useDebugRecordings'

function formatCreatedAt(createdAt: number): string {
  return new Date(createdAt).toLocaleString()
}

export function DebugRecordingsScreen() {
  const debug = useDebugRecordings()

  const startReplay = async (name: string) => {
    const started = await debug.replayRecording(name)
    // Replay drives the normal live UI — jump back to the main screen to watch it.
    if (started) router.dismissAll()
  }

  const replayButton = (name: string) => (
    <Button
      label={debug.replayingName === name ? 'Starting...' : 'Replay'}
      size="sm"
      variant="secondary"
      loading={debug.replayingName === name}
      disabled={debug.replayingName != null || debug.exportingName != null}
      onPress={() => void startReplay(name)}
    />
  )

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
          iconColor={theme.status.error.color}
          label="Record future sessions"
          hint="Applies to every new board session until disabled"
          right={
            <Switch
              value={debug.enabled}
              onValueChange={debug.setEnabled}
              trackColor={{ false: theme.palette.slate.border, true: theme.status.error.border }}
              thumbColor={debug.enabled ? theme.status.error.color : theme.palette.slate.textMuted}
            />
          }
        />
      </SettingsCard>

      <View style={styles.warning}>
        <WarningIcon size={16} color={theme.status.warning.color} weight="fill" />
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
        <ActivityIndicator color={theme.palette.sky.color} />
      ) : debug.recordings.length === 0 ? (
        <Text style={styles.emptyText}>No debug recordings yet.</Text>
      ) : (
        <SettingsCard>
          {debug.recordings.map((recording) => (
            <SettingsRow
              key={recording.name}
              icon={RecordIcon}
              iconColor={theme.palette.sky.color}
              label={recording.name}
              hint={`device · ${formatCreatedAt(recording.createdAt)} · ${formatBytes(recording.sizeBytes)}`}
              right={
                <View style={styles.rowActions}>
                  {replayButton(recording.name)}
                  <Button
                    label={debug.exportingName === recording.name ? 'Exporting...' : 'Export'}
                    size="sm"
                    variant="secondary"
                    loading={debug.exportingName === recording.name}
                    disabled={debug.exportingName != null || debug.replayingName != null}
                    onPress={() => void debug.exportRecording(recording)}
                  />
                </View>
              }
            />
          ))}
        </SettingsCard>
      )}

      {debug.fixtures.length > 0 && (
        <>
          <SettingsSectionTitle>Bundled fixtures</SettingsSectionTitle>
          <SettingsCard>
            {debug.fixtures.map((fixture) => (
              <SettingsRow
                key={fixture.name}
                icon={PackageIcon}
                iconColor={theme.palette.slate.textSecondary}
                label={fixture.name}
                hint={`bundled · ${formatBytes(fixture.sizeBytes)}`}
                right={replayButton(fixture.name)}
              />
            ))}
          </SettingsCard>
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 16,
    gap: 8,
    backgroundColor: theme.palette.slate.bg,
  },
  warning: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: theme.status.warning.bg,
  },
  warningText: {
    flex: 1,
    color: theme.status.warning.text,
    fontSize: 12,
    lineHeight: 17,
  },
  rowActions: {
    flexDirection: 'row',
    gap: 6,
  },
  recordingsHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshText: {
    color: theme.palette.sky.color,
    fontSize: 13,
    fontWeight: '700',
  },
  errorText: {
    color: theme.status.error.color,
    fontSize: 12,
  },
  emptyText: {
    color: theme.palette.slate.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
})
