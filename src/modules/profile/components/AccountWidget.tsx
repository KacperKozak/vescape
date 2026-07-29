import { useUser } from '@clerk/expo'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { UserCircleIcon, WarningCircleIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'
import { Text } from '@/components/base/Text'
import { LinkWidget } from '@/components/widgets/LinkWidget'
import { widgetSurface } from '@/components/widgets/widgetSurface'
import { theme } from '@/constants/theme'
import { useDeviceAuthStore } from '@/modules/profile/store/deviceAuthStore'
import { routes } from '@/navigation/routes'

interface AccountWidgetProps {
  onNavigate: () => void
}

export function AccountWidget({ onNavigate }: AccountWidgetProps) {
  const router = useRouter()
  const { isLoaded, isSignedIn, user } = useUser()
  const deviceAuthStatus = useDeviceAuthStore((state) => state.status)
  const deviceAuthError = useDeviceAuthStore((state) => state.error)
  const retryDeviceAuth = useDeviceAuthStore((state) => state.retry)

  const navigate = (route: typeof routes.signIn | typeof routes.account) => {
    onNavigate()
    router.push(route)
  }

  if (!isLoaded) {
    return (
      <View style={[styles.widget, styles.loading]}>
        <ActivityIndicator size="small" color={theme.palette.cyan.color} />
        <Text style={styles.secondaryText}>Checking your Vescape account…</Text>
      </View>
    )
  }

  if (!isSignedIn) {
    return (
      <LinkWidget
        icon={UserCircleIcon}
        accent={theme.palette.cyan.color}
        label="Vescape account"
        hint="Optional — sign in for online features"
        onPress={() => navigate(routes.signIn)}
      />
    )
  }

  return (
    <View style={[styles.widget, styles.account]}>
      <View style={styles.accountRow}>
        {user.imageUrl ? (
          <Image source={user.imageUrl} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarFallback}>
            <UserCircleIcon size={28} color={theme.palette.cyan.color} weight="duotone" />
          </View>
        )}

        <View style={styles.identity}>
          <Text style={styles.accountLabel}>Vescape account</Text>
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
          onPress={() => navigate(routes.account)}
        />
      </View>

      {deviceAuthStatus === 'provisioning' ? (
        <View style={styles.deviceAuthStatus}>
          <ActivityIndicator size="small" color={theme.palette.cyan.color} />
          <Text style={styles.secondaryText}>Finishing account setup…</Text>
        </View>
      ) : null}

      {deviceAuthStatus === 'failed' ? (
        <View style={styles.deviceAuthStatus}>
          <WarningCircleIcon size={18} color={theme.status.error.text} weight="duotone" />
          <View style={styles.deviceAuthErrorCopy}>
            <Text selectable style={styles.deviceAuthError}>
              Couldn’t connect your account to the Vescape server. Online features are unavailable.
            </Text>
            {deviceAuthError ? (
              <Text selectable style={styles.deviceAuthErrorDetail}>
                {deviceAuthError}
              </Text>
            ) : null}
          </View>
          <Button label="Retry" size="sm" variant="secondary" onPress={retryDeviceAuth} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  widget: {
    ...widgetSurface,
    padding: 16,
  },
  loading: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  account: {
    gap: 12,
  },
  accountRow: {
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
    minWidth: 0,
    gap: 2,
  },
  accountLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
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
  deviceAuthStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deviceAuthError: {
    color: theme.status.error.text,
    fontSize: 12,
    lineHeight: 17,
  },
  deviceAuthErrorCopy: {
    flex: 1,
    gap: 2,
  },
  deviceAuthErrorDetail: {
    color: theme.palette.slate.textMuted,
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 15,
  },
})
