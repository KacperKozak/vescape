import { useAuth } from '@clerk/expo'
import { UserProfileView } from '@clerk/expo/native'
import { useRouter } from 'expo-router'
import { useEffect } from 'react'

import { routes } from '@/navigation/routes'

export function ClerkAccountScreen() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false })

  useEffect(() => {
    if (!isLoaded || isSignedIn) return

    router.replace(routes.profile)
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded || !isSignedIn) return null

  return <UserProfileView isDismissible={false} style={{ flex: 1 }} />
}
