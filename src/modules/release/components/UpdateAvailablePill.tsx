import { GiftIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'
import { theme } from '@/constants/theme'

interface UpdateAvailablePillProps {
  latestVersion: string
  onPress: () => void
}

export function UpdateAvailablePill({ latestVersion, onPress }: UpdateAvailablePillProps) {
  return (
    <Button
      label={`Update to v${latestVersion}`}
      onPress={onPress}
      icon={GiftIcon}
      accessibilityLabel={`Update Vescape to version ${latestVersion}`}
      style={{ backgroundColor: theme.status.upgrade.color, marginTop: 12 }}
    />
  )
}
