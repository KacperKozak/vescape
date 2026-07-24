import { Linking } from 'react-native'

import type { CommunityMessageAction } from 'vescape-core'
import {
  acknowledgeCommunityMessage,
  currentCommunityMessage,
} from '@/modules/release/lib/communityMessages'
import { CommunityMessageModal } from '@/modules/release/components/CommunityMessageModal'
import { useAppStatusStore } from '@/modules/release/store/appStatusStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'

/**
 * Presents native Community Messages one at a time, ordered by type priority. Native owns the raw
 * messages (App Status, in-process) and the acknowledged IDs (App Settings, durable); this gate
 * derives the current message and persists an acknowledgement on dismiss or action.
 *
 * Independent of the Update Warning / App Block surfaces: a Community Message only communicates and
 * never gates capability availability.
 */
export function CommunityMessageGate() {
  const messages = useAppStatusStore((state) => state.status?.messages ?? EMPTY_MESSAGES)
  const dismissedIds = useSettingsStore((state) => state.dismissedCommunityMessageIds)
  const setSetting = useSettingsStore((state) => state.set)

  const message = currentCommunityMessage(messages, dismissedIds)

  const acknowledge = (id: string) => {
    // Read the freshest list at call time so a rapid second dismiss can't drop the first ID.
    const current = useSettingsStore.getState().dismissedCommunityMessageIds
    void setSetting('dismissedCommunityMessageIds', acknowledgeCommunityMessage(current, id))
  }

  const onDismiss = () => {
    if (message) acknowledge(message.id)
  }

  const onAction = (action: CommunityMessageAction) => {
    if (!message) return
    // An action acknowledges the message too — the type only drives presentation, not behavior.
    acknowledge(message.id)
    void Linking.openURL(action.url).catch(() => {})
  }

  return <CommunityMessageModal message={message} onDismiss={onDismiss} onAction={onAction} />
}

/** Stable empty reference so the selector doesn't allocate a new array each render. */
const EMPTY_MESSAGES: [] = []
