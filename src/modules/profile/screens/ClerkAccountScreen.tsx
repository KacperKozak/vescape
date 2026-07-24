import { useAuth } from '@clerk/expo'
import { UserProfileView } from '@clerk/expo/native'
import { useNetworkState } from 'expo-network'
import { useRouter } from 'expo-router'
import { useCallback, useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import { WifiSlashIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'
import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { routes } from '@/navigation/routes'

export function ClerkAccountScreen() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false })
  const networkState = useNetworkState()

  const leaveAccount = useCallback(() => {
    if (router.canGoBack()) router.back()
    else router.replace(routes.profileStats)
  }, [router])

  useEffect(() => {
    if (!isLoaded || isSignedIn) return

    router.replace(routes.profileStats)
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded || !isSignedIn) return null

  // Account management edits live on Clerk's servers — unlike the rest of the app it
  // genuinely needs internet. Local features and the cached identity stay available.
  if (networkState.isInternetReachable === false) {
    return (
      <View style={styles.offline}>
        <WifiSlashIcon size={40} color={theme.palette.slate.textMuted} weight="duotone" />
        <Text style={styles.offlineTitle}>Internet required</Text>
        <Text style={styles.offlineText}>
          Managing your Vescape account needs a connection. You stay signed in and the rest of the
          app keeps working offline.
        </Text>
        <Button label="Go back" variant="secondary" onPress={leaveAccount} />
      </View>
    )
  }

  return (
    // Clerk owns the only visible dismiss control — the Expo header is hidden
    // for this route in src/app/_layout.tsx.
    <UserProfileView isDismissible onDismiss={leaveAccount} style={styles.profile} />
  )
}

const styles = StyleSheet.create({
  profile: {
    flex: 1,
  },
  offline: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 32,
  },
  offlineTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  offlineText: {
    color: theme.palette.slate.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
})
