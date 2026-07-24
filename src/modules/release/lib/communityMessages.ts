import type { CommunityMessage, CommunityMessageType } from 'vescape-core'

/**
 * Community Message presentation is JS-only: native holds the raw server messages (in-process) and
 * the acknowledged IDs (durable App Settings), and this module derives the one-at-a-time queue from
 * them. Native never sorts or filters — keep this the single source of that logic.
 */

/** Lower sorts first: critical before warning before info. */
const TYPE_PRIORITY: Record<CommunityMessageType, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

/**
 * Defensive validity check. Native already rejects malformed messages, but the E2E fake and future
 * senders bypass that path, so a bad entry must never crash or hide the valid ones.
 */
function isRenderableMessage(message: CommunityMessage): boolean {
  return (
    typeof message?.id === 'string' &&
    message.id.length > 0 &&
    typeof message.body === 'string' &&
    message.body.length > 0 &&
    message.type in TYPE_PRIORITY
  )
}

/**
 * The visible Community Messages in display order: acknowledged IDs and invalid entries filtered
 * out, then ordered by type priority. Server order is preserved within a single type (the sort is
 * stable), so a type's messages appear in the order the server sent them.
 */
export function communityMessageQueue(
  messages: CommunityMessage[],
  dismissedIds: string[],
): CommunityMessage[] {
  const dismissed = new Set(dismissedIds)
  return messages
    .filter((message) => isRenderableMessage(message) && !dismissed.has(message.id))
    .sort((a, b) => TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type])
}

/** The single Community Message to present now, or `null` when the queue is empty. */
export function currentCommunityMessage(
  messages: CommunityMessage[],
  dismissedIds: string[],
): CommunityMessage | null {
  return communityMessageQueue(messages, dismissedIds)[0] ?? null
}

/**
 * Acknowledge a message ID — the durable list to persist after a dismiss or a completed action.
 * Idempotent: re-acknowledging an already-present ID returns the same list unchanged.
 */
export function acknowledgeCommunityMessage(dismissedIds: string[], id: string): string[] {
  return dismissedIds.includes(id) ? dismissedIds : [...dismissedIds, id]
}
