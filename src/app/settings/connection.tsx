import { useState } from 'react'
import { Alert, Linking, Platform, ScrollView, StyleSheet, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  BluetoothConnectedIcon,
  RecordIcon,
  RocketLaunchIcon,
  SpeakerHighIcon,
} from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { theme } from '@/constants/theme'
import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { IconHero } from '@/components/ui/settings/IconHero'
import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { useSettingsStore } from '@/store/settingsStore'
import { ensureBackgroundLocation, hasBackgroundLocation } from '@/hooks/usePermissions'

export default function ConnectionSettingsScreen() {
  const {
    autoConnect,
    autoRecording,
    companionPresenceEnabled,
    connectionSoundsEnabled,
    set,
    setCompanionPresence,
  } = useSettingsStore(
    useShallow((s) => ({
      autoConnect: s.autoConnect,
      autoRecording: s.autoRecording,
      companionPresenceEnabled: s.companionPresenceEnabled,
      connectionSoundsEnabled: s.connectionSoundsEnabled,
      set: s.set,
      setCompanionPresence: s.setCompanionPresence,
    })),
  )

  const [bgLocationPrompt, setBgLocationPrompt] = useState(false)

  const enableCompanion = () =>
    setCompanionPresence(true).catch((error) => {
      console.warn('Companion presence toggle failed', error)
      Alert.alert(
        'Auto start app',
        error instanceof Error ? error.message : 'Could not enable auto start',
      )
    })

  const onCompanionToggle = async (next: boolean) => {
    if (!next) {
      void setCompanionPresence(false)
      return
    }
    // Hands-off auto-start records GPS only with "Allow all the time": the OS starts the service
    // from the background and withholds while-in-use location. Explain why before any grant attempt.
    if (await hasBackgroundLocation()) {
      void enableCompanion()
    } else {
      setBgLocationPrompt(true)
    }
  }

  const onBgLocationConfirm = async () => {
    setBgLocationPrompt(false)
    // Android 10 grants inline; Android 11+ removed the dialog, so fall back to Settings.
    if (await ensureBackgroundLocation()) {
      void enableCompanion()
    } else {
      Linking.openSettings()
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={BluetoothConnectedIcon}
          description="Choose how the app wakes up, connects to your board, and reacts when the board connects."
        />
        <SettingsCard>
          {Platform.OS === 'android' ? (
            <SettingsRow
              icon={RocketLaunchIcon}
              iconColor={theme.palette.green.color}
              label="Auto start app"
              hint="When your phone finds your board, it will automatically start the app in the background"
              right={
                <Switch
                  value={companionPresenceEnabled}
                  onValueChange={(v) => void onCompanionToggle(v)}
                  trackColor={{ false: theme.palette.slate.border, true: theme.palette.sky.border }}
                  thumbColor={
                    companionPresenceEnabled
                      ? theme.palette.sky.color
                      : theme.palette.slate.textMuted
                  }
                />
              }
            />
          ) : null}
          <SettingsRow
            icon={BluetoothConnectedIcon}
            iconColor={theme.palette.cyan.color}
            label="Auto connect"
            hint={
              companionPresenceEnabled
                ? 'Required by Auto start app'
                : 'Connect to your board when the app opens'
            }
            right={
              <Switch
                value={autoConnect}
                disabled={companionPresenceEnabled}
                onValueChange={(v) => void set('autoConnect', v)}
                trackColor={{
                  false: theme.palette.slate.border,
                  true: companionPresenceEnabled
                    ? theme.palette.slate.border
                    : theme.palette.sky.border,
                }}
                thumbColor={
                  companionPresenceEnabled
                    ? theme.palette.slate.textMuted
                    : autoConnect
                      ? theme.palette.sky.color
                      : theme.palette.slate.textMuted
                }
              />
            }
          />
          <SettingsRow
            icon={RecordIcon}
            iconWeight="fill"
            iconColor={theme.status.error.color}
            label="Auto recording"
            hint="Start recording when board connects"
            right={
              <Switch
                value={autoRecording}
                onValueChange={(v) => void set('autoRecording', v)}
                trackColor={{ false: theme.palette.slate.border, true: theme.palette.sky.border }}
                thumbColor={autoRecording ? theme.palette.sky.color : theme.palette.slate.textMuted}
              />
            }
          />
          <SettingsRow
            icon={SpeakerHighIcon}
            iconColor={theme.palette.cyan.color}
            label="Connection sounds"
            hint="Play on/off sounds on connect and dropout"
            right={
              <Switch
                value={connectionSoundsEnabled}
                onValueChange={(v) => void set('connectionSoundsEnabled', v)}
                trackColor={{ false: theme.palette.slate.border, true: theme.palette.sky.border }}
                thumbColor={
                  connectionSoundsEnabled ? theme.palette.sky.color : theme.palette.slate.textMuted
                }
              />
            }
          />
        </SettingsCard>
      </ScrollView>
      <ConfirmModal
        visible={bgLocationPrompt}
        title="Allow location all the time"
        message={
          'Auto start wakes the app and records your ride while the phone is in your pocket. ' +
          'Android only sends GPS to a background-started app when location is set to “Allow all ' +
          'the time”. Without it, these rides have no GPS track.'
        }
        confirmLabel="Continue"
        cancelLabel="Not now"
        onConfirm={onBgLocationConfirm}
        onCancel={() => setBgLocationPrompt(false)}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.palette.slate.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
})
