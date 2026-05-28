import { DeviceMotion } from 'expo-sensors'

import type { PhoneHeadingAdapter } from './phoneHeading'

export const deviceMotionPhoneHeadingAdapter: PhoneHeadingAdapter = {
  isAvailableAsync: () => DeviceMotion.isAvailableAsync(),
  getPermissionsAsync: () => DeviceMotion.getPermissionsAsync(),
  requestPermissionsAsync: () => DeviceMotion.requestPermissionsAsync(),
  setUpdateInterval: (intervalMs) => DeviceMotion.setUpdateInterval(intervalMs),
  addListener: (listener) => DeviceMotion.addListener(listener),
}
