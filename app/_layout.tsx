import '../global.css'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#111827' },
          headerTintColor: '#f9fafb',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#111827' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="device/[id]" options={{ title: 'Telemetry' }} />
        <Stack.Screen name="add-board/scan" options={{ title: 'Add Board' }} />
        <Stack.Screen name="add-board/details" options={{ title: 'Board Details' }} />
      </Stack>
      <StatusBar style="light" />
    </>
  )
}
