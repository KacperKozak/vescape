import { useRouter } from 'expo-router'
import { ArrowLeftIcon } from 'phosphor-react-native'

import { IconButton } from '@/components/ui/base/IconButton'

export function HeaderBackButton() {
  const router = useRouter()
  return <IconButton icon={ArrowLeftIcon} onPress={() => router.back()} style={{ marginLeft: 4 }} />
}
