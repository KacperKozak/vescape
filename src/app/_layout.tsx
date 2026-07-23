import * as Sentry from '@sentry/react-native'
import { ClerkProvider } from '@clerk/expo'
import { tokenCache } from '@clerk/expo/token-cache'
import { resourceCache } from '@clerk/expo/resource-cache'
import { useFonts } from 'expo-font'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { configureReanimatedLogger } from 'react-native-reanimated'

import { DiagnosticErrorBoundary } from '@/modules/diagnostics/DiagnosticErrorBoundary'
import { HeaderBackButton } from '@/components/base/HeaderBackButton'
import { initSentry } from '@/config/sentry'
import { stackScreens } from '@/navigation/routes'
import { startAlertsBoardSync } from '@/bootstrap/alertsBoardSync'
import { startAppDataSync } from '@/bootstrap/appDataSync'
import { startBoardWarningsSync } from '@/modules/board/store/boardWarningsStore'
import { useGroupRideStore } from '@/modules/group-ride/store/groupRideStore'
import { useRiderStore } from '@/modules/group-ride/store/riderStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import { theme } from '@/constants/theme'

const clerkPublishableKey = requireClerkPublishableKey()

function requireClerkPublishableKey(): string {
  const key = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!key) throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not configured')
  return key
}

// Keep the native splash visible until Raleway loads so there is no font-flash
// on cold start. `expo-router` already prevents auto-hide; this makes the gate
// explicit and ties `hideAsync()` to font readiness.
void SplashScreen.preventAutoHideAsync()

// Reanimated 4.5.0 strict mode false-positives on useAnimatedStyle's initial
// render evaluation; drop this once the Expo SDK pin reaches reanimated >=4.5.1.
configureReanimatedLogger({ strict: false })

initSentry()

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Raleway-300': require('../../assets/fonts/Raleway-300.ttf'),
    'Raleway-400': require('../../assets/fonts/Raleway-400.ttf'),
    'Raleway-500': require('../../assets/fonts/Raleway-500.ttf'),
    'Raleway-600': require('../../assets/fonts/Raleway-600.ttf'),
    'Raleway-700': require('../../assets/fonts/Raleway-700.ttf'),
    'Raleway-800': require('../../assets/fonts/Raleway-800.ttf'),
    'Raleway-900': require('../../assets/fonts/Raleway-900.ttf'),
  })

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync()
  }, [fontsLoaded, fontError])

  useEffect(() => {
    void useSettingsStore.getState().load()
    void useRiderStore.getState().load()
    useGroupRideStore.getState().startObserving()
    const stopAppDataSync = startAppDataSync()
    const stopBoardWarningsSync = startBoardWarningsSync()
    const stopAlertsBoardSync = startAlertsBoardSync()
    return () => {
      useGroupRideStore.getState().stopObserving()
      stopAppDataSync()
      stopBoardWarningsSync()
      stopAlertsBoardSync()
    }
  }, [])

  // Hold the splash until Raleway is ready (or fails to load). Returning null
  // keeps the native splash up without an unmount/mount churn.
  if (!fontsLoaded && !fontError) return null

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      tokenCache={tokenCache}
      // Keeps the signed-in identity readable offline — losing connectivity must not
      // blank the account UI or look like a sign-out.
      __experimental_resourceCache={resourceCache}
    >
      <DiagnosticErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: theme.palette.slate.bg },
              headerTintColor: theme.palette.slate.textPrimary,
              headerTitleStyle: { fontFamily: theme.font('600'), fontSize: 14 },
              headerTitleAlign: 'center',
              headerShadowVisible: false,
              headerLeft: () => <HeaderBackButton />,
              contentStyle: { backgroundColor: theme.palette.slate.bg },
            }}
          >
            <Stack.Screen name={stackScreens.home} options={{ headerShown: false }} />
            <Stack.Screen name={stackScreens.profileStats} options={{ title: 'Profile stats' }} />
            {/* Clerk's native views render their own header — a second Expo header
                would duplicate the back/dismiss layer. */}
            <Stack.Screen name={stackScreens.signIn} options={{ headerShown: false }} />
            <Stack.Screen name={stackScreens.account} options={{ headerShown: false }} />
            <Stack.Screen name={stackScreens.settings} options={{ title: 'Settings' }} />
            <Stack.Screen name={stackScreens.settingsDev} options={{ title: 'Dev' }} />
            <Stack.Screen
              name={stackScreens.settingsDebugRecordings}
              options={{ title: 'Debug recordings' }}
            />
            <Stack.Screen
              name={stackScreens.settingsComponents}
              options={{ title: 'Components' }}
            />
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
              name={stackScreens.settingsRawSettings}
              options={{ title: 'Raw settings' }}
            />
            <Stack.Screen
              name={stackScreens.settingsPrivacyZones}
              options={{ title: 'Privacy Zones' }}
            />
            <Stack.Screen
              name={stackScreens.settingsConnection}
              options={{ title: 'Connection' }}
            />
            <Stack.Screen
              name={stackScreens.settingsDiagnostics}
              options={{ title: 'Diagnostics' }}
            />
            <Stack.Screen
              name={stackScreens.settingsLiveTelemetry}
              options={{ title: 'Live telemetry' }}
            />
            <Stack.Screen name={stackScreens.settingsAlerts} options={{ title: 'Alerts' }} />
            <Stack.Screen name={stackScreens.settingsMap} options={{ title: 'Map' }} />
            <Stack.Screen name={stackScreens.settingsWatch} options={{ title: 'Watch' }} />
            <Stack.Screen name={stackScreens.settingsFilters} options={{ title: 'Filters' }} />
            <Stack.Screen name={stackScreens.settingsGraphs} options={{ title: 'Graphs' }} />
            <Stack.Screen name={stackScreens.settingsDatabase} options={{ title: 'Database' }} />
            <Stack.Screen name={stackScreens.settingsAbout} options={{ title: 'About us' }} />
            <Stack.Screen name={stackScreens.controlBatteryRaw} options={{ title: 'Raw BMS' }} />
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
    </ClerkProvider>
  )
}

export default Sentry.wrap(RootLayout)
