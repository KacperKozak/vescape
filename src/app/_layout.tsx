import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { DiagnosticErrorBoundary } from '@/components/DiagnosticErrorBoundary'
import { HeaderBackButton } from '@/components/navigation/HeaderBackButton'
import { stackScreens } from '@/navigation/routes'
import { useAlertsStore } from '@/store/alertsStore'

export default function RootLayout() {
  useEffect(() => {
    void useAlertsStore.getState().load()
  }, [])

  return (
    <DiagnosticErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#111827' },
            headerTintColor: '#f9fafb',
            headerTitleStyle: { fontWeight: '600', fontSize: 14 },
            headerTitleAlign: 'center',
            headerShadowVisible: false,
            headerLeft: () => <HeaderBackButton />,
            contentStyle: { backgroundColor: '#111827' },
          }}
        >
          <Stack.Screen name={stackScreens.home} options={{ headerShown: false }} />
          <Stack.Screen name={stackScreens.profile} options={{ title: 'Profile' }} />
          <Stack.Screen name={stackScreens.settings} options={{ title: 'Settings' }} />
          <Stack.Screen name={stackScreens.settingsDev} options={{ title: 'Dev' }} />
          <Stack.Screen name={stackScreens.settingsComponents} options={{ title: 'Components' }} />
          <Stack.Screen name={stackScreens.tune} options={{ title: 'Tune' }} />
          <Stack.Screen name={stackScreens.tuneHistory} options={{ title: 'Tune History' }} />
          <Stack.Screen name={stackScreens.addBoardScan} options={{ title: 'Add Board' }} />
          <Stack.Screen name={stackScreens.addBoardDetails} options={{ title: 'Board Details' }} />
        </Stack>
        <StatusBar style="light" translucent backgroundColor="transparent" />
      </GestureHandlerRootView>
    </DiagnosticErrorBoundary>
  )
}
