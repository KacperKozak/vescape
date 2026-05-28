import { useEffect, useState } from 'react'

import {
  deviceMotionPhoneHeadingAdapter,
  smoothPhoneHeading,
  startPhoneHeadingUpdates,
  type PhoneHeadingAdapter,
  type PhoneHeadingStatus,
} from './phoneHeading'

export interface PhoneHeadingState {
  headingDeg: number | null
  status: PhoneHeadingStatus | 'idle'
}

export function usePhoneHeading(
  active: boolean,
  adapter: PhoneHeadingAdapter = deviceMotionPhoneHeadingAdapter,
): PhoneHeadingState {
  const [state, setState] = useState<PhoneHeadingState>({ headingDeg: null, status: 'idle' })

  useEffect(() => {
    if (!active) {
      const frame = requestAnimationFrame(() => setState({ headingDeg: null, status: 'idle' }))
      return () => cancelAnimationFrame(frame)
    }

    let disposed = false
    let cleanup: (() => void) | null = null
    const readyFrame = requestAnimationFrame(() =>
      setState((current) => ({ ...current, status: 'idle' })),
    )

    void startPhoneHeadingUpdates(adapter, (headingDeg) => {
      if (!disposed) {
        setState((current) => ({
          headingDeg: smoothPhoneHeading(current.headingDeg, headingDeg),
          status: 'ready',
        }))
      }
    }).then((subscription) => {
      if (disposed) {
        subscription.remove()
        return
      }
      cleanup = subscription.remove
      setState((current) => ({ ...current, status: subscription.status }))
    })

    return () => {
      disposed = true
      cancelAnimationFrame(readyFrame)
      cleanup?.()
    }
  }, [active, adapter])

  return state
}
