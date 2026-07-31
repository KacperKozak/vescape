import { ArrowFatLinesUpIcon } from 'phosphor-react-native'

import { Button } from '@/components/base/Button'

interface UpdateAvailablePillProps {
  latestVersion: string
  onPress: () => void
}

export function UpdateAvailablePill({ latestVersion, onPress }: UpdateAvailablePillProps) {
  return (
    <Button
      label={`Update to v${latestVersion}`}
      variant="tune"
      onPress={onPress}
      icon={ArrowFatLinesUpIcon}
      accessibilityLabel={`Update Vescape to version ${latestVersion}`}
      style={{ marginTop: 12 }}
    />
  )
}
