import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { DiagnosticErrorBoundary } from '@/components/domain/main/DiagnosticErrorBoundary'
import { HeaderBackButton } from '@/components/ui/base/HeaderBackButton'
import { stackScreens } from '@/navigation/routes'
import { useAlertsStore } from '@/store/alertsStore'
import { useSettingsStore } from '@/store/settingsStore'
import { theme } from '@/constants/theme'

export default function RootLayout() {
  useEffect(() => {
    void useSettingsStore.getState().load()
    void useAlertsStore.getState().load()
  }, [])

  return (
    <DiagnosticErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.palette.slate.bg },
            headerTintColor: theme.palette.slate.textPrimary,
            headerTitleStyle: { fontWeight: '600', fontSize: 14 },
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerLeft: () => <HeaderBackButton />,
            contentStyle: { backgroundColor: theme.palette.slate.bg },
          }}
        >
          <Stack.Screen name={stackScreens.home} options={{ headerShown: false }} />
          <Stack.Screen name={stackScreens.profile} options={{ title: 'Profile' }} />
          <Stack.Screen name={stackScreens.settings} options={{ title: 'Settings' }} />
          <Stack.Screen name={stackScreens.settingsDev} options={{ title: 'Dev' }} />
          <Stack.Screen
            name={stackScreens.settingsDebugRecordings}
            options={{ title: 'Debug recordings' }}
          />
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
          <Stack.Screen name={stackScreens.settingsConnection} options={{ title: 'Connection' }} />
          <Stack.Screen
            name={stackScreens.settingsLiveTelemetry}
            options={{ title: 'Live telemetry' }}
          />
          <Stack.Screen name={stackScreens.settingsFilters} options={{ title: 'Filters' }} />
          <Stack.Screen name={stackScreens.settingsGraphs} options={{ title: 'Graphs' }} />
          <Stack.Screen name={stackScreens.settingsDatabase} options={{ title: 'Database' }} />
          <Stack.Screen name={stackScreens.settingsAbout} options={{ title: 'About us' }} />
          <Stack.Screen name={stackScreens.tune} options={{ title: 'Tune' }} />
          <Stack.Screen name={stackScreens.tuneHistory} options={{ title: 'Tune History' }} />
          <Stack.Screen name={stackScreens.addBoardScan} options={{ title: 'Pair Board' }} />
          <Stack.Screen name={stackScreens.addBoard} options={{ title: 'Add Board' }} />
          <Stack.Screen name={stackScreens.editBoard} options={{ title: 'Edit Board' }} />
          <Stack.Screen name={stackScreens.editBoardLink} options={{ title: 'Board Link' }} />
        </Stack>
        <StatusBar style="light" />
      </GestureHandlerRootView>
    </DiagnosticErrorBoundary>
  )
}
