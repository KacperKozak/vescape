import { useState } from 'react'
import { GiftIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'
import { Markdown } from '@/components/base/Markdown'
import { FadeCardModal } from '@/components/modals/FadeCardModal'
import { theme } from '@/constants/theme'
import { DEFAULT_UPDATE_WARNING_MESSAGE } from '@/modules/release/constants/updateWarning'

interface UpdateWarningModalProps {
  visible: boolean
  /** Markdown body — the server message or a bundled default. */
  message: string
  onDismiss: () => void
  /** Open the stable platform download route. */
  onUpdate: () => void
  /** The card finished fading out. Lets the caller hand over to the next Release surface. */
  onExited?: () => void
}

/**
 * Non-blocking Update Warning surface: renders the server (or bundled) Markdown message and a single
 * dismiss action. An Update Warning changes no capability availability — this only recommends.
 * Presentational only; {@link ReleaseSurfaces} decides when it appears and drives dismissal.
 */
export function UpdateWarningModal({
  visible,
  message,
  onDismiss,
  onUpdate,
  onExited,
}: UpdateWarningModalProps) {
  // Keep the last shown message so the exit animation renders content instead of blanking.
  const [rendered, setRendered] = useState(DEFAULT_UPDATE_WARNING_MESSAGE)
  if (visible && message !== rendered) setRendered(message)

  return (
    <FadeCardModal
      visible={visible}
      onDismiss={onDismiss}
      title="Update available"
      titleIcon={GiftIcon}
      titleIconColor={theme.palette.purple.color}
      footer={
        <Button
          label="Update"
          onPress={onUpdate}
          style={{ backgroundColor: theme.status.upgrade.color }}
        />
      }
      onExited={onExited}
    >
      <Markdown>{rendered}</Markdown>
    </FadeCardModal>
  )
}
