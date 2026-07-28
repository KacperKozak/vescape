import { useAuth } from '@clerk/expo'
import { useEffect } from 'react'

import { useMapStore } from '@/modules/map/store/mapStore'

/** Keeps only the active Clerk id in volatile JS state. No Clerk account is copied to SQLite. */
export function MapPointClerkIdentitySync() {
  const { isLoaded, userId } = useAuth({ treatPendingAsSignedOut: false })

  useEffect(() => {
    if (!isLoaded) return
    useMapStore.getState().setClerkUserId(userId ?? null)
  }, [isLoaded, userId])

  return null
}
