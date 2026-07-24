import { Button } from '@/components/base/Button'
import { theme } from '@/constants/theme'

interface UpdateAvailablePillProps {
  latestVersion: string
  onPress: () => void
}

export function UpdateAvailablePill({ latestVersion, onPress }: UpdateAvailablePillProps) {
  return (
    <Button
      label={`v${latestVersion} update available`}
      onPress={onPress}
      accessibilityLabel={`Update Vescape to version ${latestVersion}`}
      style={{ backgroundColor: theme.status.upgrade.color }}
    />
  )
}
