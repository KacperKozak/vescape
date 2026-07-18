import { StyleSheet, ScrollView, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ClockCountdownIcon, WatchIcon } from 'phosphor-react-native'
import { useShallow } from 'zustand/react/shallow'

import { theme } from '@/constants/theme'
import { SettingsCard } from '@/components/settings/SettingsCard'
import { SettingsRow } from '@/components/settings/SettingsRow'
import { Stepper } from '@/components/forms/Stepper'
import { IconHero } from '@/components/settings/IconHero'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

export default function WatchSettingsScreen() {
  const { wearAutoLaunchOnConnect, wearMirrorIntervalMs, set } = useSettingsStore(
    useShallow((s) => ({
      wearAutoLaunchOnConnect: s.wearAutoLaunchOnConnect,
      wearMirrorIntervalMs: s.wearMirrorIntervalMs,
      set: s.set,
    })),
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero
          icon={WatchIcon}
          description="Watch Mirror shows live telemetry on your Wear OS watch while you ride."
        />
        <SettingsCard>
          <SettingsRow
            icon={WatchIcon}
            iconColor={theme.palette.amber.color}
            label="Open watch app on connect"
            hint="Launch the Watch Mirror when the board connects"
            right={
              <Switch
                value={wearAutoLaunchOnConnect}
                onValueChange={(v) => void set('wearAutoLaunchOnConnect', v)}
                trackColor={{ false: theme.palette.slate.border, true: theme.palette.sky.border }}
                thumbColor={
                  wearAutoLaunchOnConnect ? theme.palette.sky.color : theme.palette.slate.textMuted
                }
              />
            }
          />
          <SettingsRow
            icon={ClockCountdownIcon}
            iconColor={theme.palette.cyan.color}
            label="Watch push interval"
            hint="Watch Mirror update cadence. Lower = faster wrist updates (stress test)"
            right={
              <Stepper
                value={wearMirrorIntervalMs}
                unit="ms"
                min={50}
                max={10000}
                step={(v, dir) => (dir === 1 ? (v < 500 ? 50 : 100) : v <= 500 ? 50 : 100)}
                onChange={(nextValue) => {
                  const clampedValue = Math.min(10000, Math.max(50, nextValue))
                  if (clampedValue !== wearMirrorIntervalMs) {
                    void set('wearMirrorIntervalMs', clampedValue)
                  }
                }}
              />
            }
          />
        </SettingsCard>
      </ScrollView>
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
