import { useUser } from '@clerk/expo'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { UserCircleIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'
import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { routes } from '@/navigation/routes'

export function AccountSection() {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Vescape account</Text>

      {!isLoaded ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={theme.palette.cyan.color} />
          <Text style={styles.secondaryText}>Checking your session…</Text>
        </View>
      ) : isSignedIn ? (
        <View style={styles.accountRow}>
          {user.imageUrl ? (
            <Image source={user.imageUrl} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={styles.avatarFallback}>
              <UserCircleIcon size={28} color={theme.palette.cyan.color} weight="duotone" />
            </View>
          )}

          <View style={styles.identity}>
            <Text numberOfLines={1} style={styles.name}>
              {user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'Vescape rider'}
            </Text>
            {user.fullName && user.primaryEmailAddress?.emailAddress ? (
              <Text numberOfLines={1} selectable style={styles.secondaryText}>
                {user.primaryEmailAddress.emailAddress}
              </Text>
            ) : null}
          </View>

          <Button
            label="Manage"
            size="sm"
            variant="secondary"
            onPress={() => router.push(routes.account)}
          />
        </View>
      ) : (
        <View style={styles.signedOut}>
          <View style={styles.signedOutCopy}>
            <UserCircleIcon size={32} color={theme.palette.cyan.color} weight="duotone" />
            <View style={styles.identity}>
              <Text style={styles.name}>Your rider identity</Text>
              <Text style={styles.secondaryText}>
                Sign in or create an account. Your local ride stats stay available either way.
              </Text>
            </View>
          </View>
          <Button label="Continue" onPress={() => router.push(routes.signIn)} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  loading: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  signedOut: {
    gap: 14,
  },
  signedOutCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: theme.palette.cyan.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  name: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryText: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
})
