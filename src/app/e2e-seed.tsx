import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { seedE2EData } from 'vesc-ble'

export default function E2ESeedScreen() {
  const { flow } = useLocalSearchParams<{ flow: string }>()
  const router = useRouter()

  useEffect(() => {
    if (flow) {
      seedE2EData(flow)
    }
    router.replace('/')
  }, [flow, router])

  return null
}
