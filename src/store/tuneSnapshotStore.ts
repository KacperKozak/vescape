import { create } from 'zustand'
import {
  getRefloatConfigSnapshot as nativeGetRefloatConfigSnapshot,
  type RefloatConfigSnapshot,
} from 'vesc-ble'

import { errorMessage } from '@/helpers/error'

type TuneSnapshotStatus = 'idle' | 'loading' | 'ready' | 'error'

interface TuneSnapshotState {
  status: TuneSnapshotStatus
  snapshot: RefloatConfigSnapshot | null
  error: string | null
}

interface TuneSnapshotActions {
  read: () => Promise<RefloatConfigSnapshot | null>
  setSnapshot: (snapshot: RefloatConfigSnapshot | null) => void
  clear: () => void
}
let readInFlight: Promise<RefloatConfigSnapshot | null> | null = null
let generation = 0

export const useTuneSnapshotStore = create<TuneSnapshotState & TuneSnapshotActions>((set) => ({
  status: 'idle',
  snapshot: null,
  error: null,

  read() {
    if (readInFlight) return readInFlight

    const readGeneration = ++generation
    set({ status: 'loading', snapshot: null, error: null })
    readInFlight = nativeGetRefloatConfigSnapshot()
      .then((snapshot) => {
        if (readGeneration === generation) {
          set({ status: 'ready', snapshot, error: null })
        }
        return snapshot
      })
      .catch((error) => {
        if (readGeneration === generation) {
          set({
            status: 'error',
            snapshot: null,
            error: errorMessage(error, 'Unable to read Refloat config.'),
          })
        }
        return null
      })
      .finally(() => {
        if (readGeneration === generation) {
          readInFlight = null
        }
      })

    return readInFlight
  },

  setSnapshot(snapshot) {
    generation += 1
    readInFlight = null
    set({
      status: snapshot ? 'ready' : 'idle',
      snapshot,
      error: null,
    })
  },

  clear() {
    generation += 1
    readInFlight = null
    set({ status: 'idle', snapshot: null, error: null })
  },
}))
