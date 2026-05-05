import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

import { stackScreens } from '@/navigation/routes'
import { useAlertsStore } from '@/store/alertsStore'

export default function RootLayout() {
  useEffect(() => {
    void useAlertsStore.getState().load()
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#111827' },
          headerTintColor: '#f9fafb',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#111827' },
        }}
      >
        <Stack.Screen name={stackScreens.home} options={{ headerShown: false }} />
        <Stack.Screen name={stackScreens.addBoardScan} options={{ title: 'Add Board' }} />
        <Stack.Screen name={stackScreens.addBoardDetails} options={{ title: 'Board Details' }} />
      </Stack>
      <StatusBar style="light" />
    </GestureHandlerRootView>
  )
}
