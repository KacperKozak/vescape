import { DEFAULT_UPDATE_WARNING_MESSAGE } from '@/modules/release/constants/updateWarning'
import { updateWarningMessage } from '@/modules/release/lib/updateWarning'
import { UpdateWarningModal } from '@/modules/release/components/UpdateWarningModal'
import { useAppStatusStore } from '@/modules/release/store/appStatusStore'

/**
 * Presents the native Update Warning once per cold launch. Renders the server Markdown message (or
 * the bundled default when the rule carries none) and lets the rider dismiss it for this launch —
 * the dismissal lives only in JS memory, so the warning returns on the next process (PRD story 4).
 *
 * `status` is `null` until the first successful native fetch (fail-open), so an offline rider sees
 * no version UI at all.
 */
export function UpdateWarningGate() {
  const message = useAppStatusStore((state) =>
    updateWarningMessage(state, DEFAULT_UPDATE_WARNING_MESSAGE),
  )
  const dismiss = useAppStatusStore((state) => state.dismissUpdateWarning)

  return (
    <UpdateWarningModal
      visible={message !== null}
      message={message ?? DEFAULT_UPDATE_WARNING_MESSAGE}
      onDismiss={dismiss}
    />
  )
}
