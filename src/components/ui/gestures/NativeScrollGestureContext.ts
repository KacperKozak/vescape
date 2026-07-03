import { createContext } from 'react'
import type { NativeGesture } from 'react-native-gesture-handler'

export const NativeScrollGestureContext = createContext<NativeGesture | null>(null)
