import { useAuth, useSession } from '@clerk/expo'
import { useEffect } from 'react'

import { SERVER_URL } from '@/config/server'
import {
  addAppStatusListener,
  getDeviceCredentialState,
  provisionDeviceCredential,
} from 'vescape-core'

let provisioning: Promise<void> | null = null
const attemptedSessionIds = new Set<string>()

export function DeviceAuthSync() {
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth({
    treatPendingAsSignedOut: false,
  })
  const { session } = useSession()

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !session) return
    const state = getDeviceCredentialState().state
    if (state === 'ready') return
    if (state === 'rejected') {
      void signOut()
      return
    }
    if (provisioning !== null || attemptedSessionIds.has(session.id)) return

    attemptedSessionIds.add(session.id)
    provisioning = provision(getToken)
      .catch(() => undefined)
      .finally(() => {
        provisioning = null
      })
  }, [getToken, isLoaded, isSignedIn, session, signOut])

  useEffect(() => {
    if (!isSignedIn) return
    const subscription = addAppStatusListener(() => {
      if (getDeviceCredentialState().state === 'rejected') void signOut()
    })
    return () => subscription.remove()
  }, [isSignedIn, signOut])

  return null
}

async function provision(getToken: () => Promise<string | null>): Promise<void> {
  const clerkToken = await getToken()
  if (!clerkToken) return
  const response = await fetch(`${SERVER_URL.replace(/\/+$/, '')}/api/auth/device-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${clerkToken}`,
    },
  })
  if (response.status === 401) return
  if (!response.ok) throw new Error(`Device credential exchange failed (${response.status})`)
  const body: unknown = await response.json()
  if (!isExchangeResponse(body)) throw new Error('Device credential exchange response is invalid')
  await provisionDeviceCredential(SERVER_URL, body.deviceToken, body.accountId)
}

function isExchangeResponse(value: unknown): value is { accountId: string; deviceToken: string } {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return typeof record.accountId === 'string' && typeof record.deviceToken === 'string'
}
