import { useEffect, useState } from 'react'
import { Keyboard, Platform, type KeyboardEvent } from 'react-native'

/**
 * Height the keyboard currently covers, or 0 while `enabled` is false. Lets a sheet sit above the
 * keyboard without wrapping it in a KeyboardAvoidingView, which fights absolute positioning.
 */
export function useKeyboardLift(enabled: boolean) {
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    if (!enabled) return

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height)
    })
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0))

    return () => {
      show.remove()
      hide.remove()
    }
  }, [enabled])

  return enabled ? keyboardHeight : 0
}
