import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState } from 'react'
import {
  BellIcon,
  GaugeIcon,
  GearSixIcon,
  MoonIcon,
  UserIcon,
  WifiHighIcon,
} from 'phosphor-react-native'

import { SettingsCard } from '@/components/ui/settings/SettingsCard'
import { SettingsRow } from '@/components/ui/settings/SettingsRow'
import { SettingsSectionTitle } from '@/components/ui/settings/SettingsSectionTitle'
import { Stepper } from '@/components/ui/forms/Stepper'
import { ShowcaseCard } from '@/components/ui/dev/ShowcaseCard'
import { theme } from '@/constants/theme'

export default function SettingsPage() {
  const [darkMode, setDarkMode] = useState(true)
  const [notifications, setNotifications] = useState(false)
  const [threshold, setThreshold] = useState(3)

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ShowcaseCard name="Settings components">
          <SettingsSectionTitle>Account</SettingsSectionTitle>
          <SettingsCard>
            <SettingsRow
              icon={UserIcon}
              label="Profile"
              hint="Edit your profile information"
              onPress={() => {}}
            />
            <SettingsRow
              icon={GearSixIcon}
              label="Preferences"
              hint="App settings and defaults"
              onPress={() => {}}
            />
          </SettingsCard>

          <SettingsSectionTitle>Appearance</SettingsSectionTitle>
          <SettingsCard>
            <SettingsRow
              icon={MoonIcon}
              iconWeight="fill"
              label="Dark mode"
              hint="Use dark theme throughout the app"
              right={
                <Switch
                  value={darkMode}
                  onValueChange={setDarkMode}
                  trackColor={{ false: theme.neutral.border, true: theme.wheel.border }}
                  thumbColor={darkMode ? theme.wheel.color : theme.neutral.textMuted}
                />
              }
            />
          </SettingsCard>

          <SettingsSectionTitle>Ride stats</SettingsSectionTitle>
          <SettingsCard>
            <SettingsRow
              icon={GaugeIcon}
              label="Moving speed threshold"
              hint="Speeds below this are treated as stopped"
              right={
                <Stepper
                  value={threshold}
                  unit="km/h"
                  min={0}
                  max={20}
                  onChange={(nextValue) => setThreshold(Math.min(20, Math.max(0, nextValue)))}
                />
              }
            />
          </SettingsCard>

          <SettingsSectionTitle>Notifications</SettingsSectionTitle>
          <SettingsCard>
            <SettingsRow
              icon={BellIcon}
              label="Push notifications"
              hint="Receive alerts about your board"
              right={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{ false: theme.neutral.border, true: theme.wheel.border }}
                  thumbColor={notifications ? theme.wheel.color : theme.neutral.textMuted}
                />
              }
            />
            <SettingsRow
              icon={WifiHighIcon}
              label="Connection alerts"
              hint="Notify when board connects or disconnects"
              onPress={() => {}}
            />
          </SettingsCard>
        </ShowcaseCard>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.neutral.bg },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
})
