import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { DiagnosticErrorBoundary } from '@/components/domain/main/DiagnosticErrorBoundary'
import { HeaderBackButton } from '@/components/ui/base/HeaderBackButton'
import { stackScreens } from '@/navigation/routes'
import { useAlertsStore } from '@/store/alertsStore'
import { theme } from '@/constants/theme'

export default function RootLayout() {
  useEffect(() => {
    void useAlertsStore.getState().load()
  }, [])

  return (
    <DiagnosticErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.neutral.bg },
            headerTintColor: theme.neutral.textPrimary,
            headerTitleStyle: { fontWeight: '600', fontSize: 14 },
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerLeft: () => <HeaderBackButton />,
            contentStyle: { backgroundColor: theme.neutral.bg },
          }}
        >
          <Stack.Screen name={stackScreens.home} options={{ headerShown: false }} />
          <Stack.Screen name={stackScreens.profile} options={{ title: 'Profile' }} />
          <Stack.Screen name={stackScreens.settings} options={{ title: 'Settings' }} />
          <Stack.Screen name={stackScreens.settingsDev} options={{ title: 'Dev' }} />
          <Stack.Screen name={stackScreens.settingsComponents} options={{ title: 'Components' }} />
          <Stack.Screen name={stackScreens.settingsDiagnostic} options={{ title: 'Diagnostic' }} />
          <Stack.Screen
            name={stackScreens.settingsNavigationDiagnostic}
            options={{ title: 'Navigation diagnostics' }}
          />
          <Stack.Screen
            name={stackScreens.settingsDiagnosticEvents}
            options={{ title: 'Event log' }}
          />
          <Stack.Screen name={stackScreens.settingsOther} options={{ title: 'Other' }} />
          <Stack.Screen
            name={stackScreens.settingsSoundPlayground}
            options={{ title: 'Sound Playground' }}
          />
          <Stack.Screen
            name={stackScreens.settingsPrivacyZones}
            options={{ title: 'Privacy Zones' }}
          />
          <Stack.Screen
            name={stackScreens.settingsTelemetryTiming}
            options={{ title: 'Telemetry Timing' }}
          />
          <Stack.Screen name={stackScreens.tune} options={{ title: 'Tune' }} />
          <Stack.Screen name={stackScreens.tuneHistory} options={{ title: 'Tune History' }} />
          <Stack.Screen name={stackScreens.addBoardScan} options={{ title: 'Pair Board' }} />
          <Stack.Screen name={stackScreens.addBoard} options={{ title: 'Add Board' }} />
          <Stack.Screen name={stackScreens.editBoard} options={{ title: 'Edit Board' }} />
        </Stack>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </DiagnosticErrorBoundary>
  )
}
