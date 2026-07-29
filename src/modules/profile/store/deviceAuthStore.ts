import { create } from 'zustand'

export type DeviceAuthStatus = 'idle' | 'provisioning' | 'ready' | 'failed'

interface DeviceAuthState {
  status: DeviceAuthStatus
  error: string | null
  retryRequestId: number
  setStatus: (status: DeviceAuthStatus, error?: string | null) => void
  retry: () => void
}

/**
 * UI projection of native credential provisioning.
 *
 * Native remains durable truth for the credential itself. This store only lets the account widget
 * show progress/failure and ask DeviceAuthSync to retry the Clerk → Device Token exchange.
 */
export const useDeviceAuthStore = create<DeviceAuthState>((set) => ({
  status: 'idle',
  error: null,
  retryRequestId: 0,
  setStatus: (status, error = null) => set({ status, error }),
  retry: () => set((state) => ({ retryRequestId: state.retryRequestId + 1 })),
}))
