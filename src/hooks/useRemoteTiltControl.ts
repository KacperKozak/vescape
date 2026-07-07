import { useEffect } from 'react'

import { useBleStore } from '@/store/bleStore'
import {
  lockRemoteTilt as lockRemoteTiltNative,
  releaseRemoteTilt,
  setRemoteTilt,
  stopRemoteTilt,
} from 'vesc-ble'

export function useRemoteTiltControl() {
  const boardConnected = useBleStore((state) => state.status === 'connected')
  const syncRemoteTilt = useBleStore((state) => state.syncRemoteTilt)

  useEffect(() => {
    syncRemoteTilt()
  }, [syncRemoteTilt])

  return {
    boardConnected,
    setRemoteTilt: (value: number) => void setRemoteTilt(value),
    releaseRemoteTilt: (value: number, durationMs: number) =>
      void releaseRemoteTilt(value, durationMs),
    lockRemoteTilt: (value: number) => void lockRemoteTiltNative(value),
    stopRemoteTilt: () => void stopRemoteTilt(),
  }
}
