import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

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
        <Stack.Screen
          name="index"
          options={{ title: 'VESC Scan' }}
        />
        <Stack.Screen
          name="device/[id]"
          options={{ title: 'Telemetry' }}
        />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
