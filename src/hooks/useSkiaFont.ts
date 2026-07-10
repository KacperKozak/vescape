import { useFont } from '@shopify/react-native-skia'
import type { FontWeight } from '@/constants/theme'

/** Metro needs static `require` calls, so every Raleway weight is mapped explicitly. */
const fontSources: Record<FontWeight, number> = {
  '300': require('../../assets/fonts/Raleway-300.ttf'),
  '400': require('../../assets/fonts/Raleway-400.ttf'),
  '500': require('../../assets/fonts/Raleway-500.ttf'),
  '600': require('../../assets/fonts/Raleway-600.ttf'),
  '700': require('../../assets/fonts/Raleway-700.ttf'),
  '800': require('../../assets/fonts/Raleway-800.ttf'),
  '900': require('../../assets/fonts/Raleway-900.ttf'),
}

/** App font (Raleway) as a Skia `SkFont` for canvas text. Returns null until loaded. */
export const useSkiaFont = (weight: FontWeight, size: number) => useFont(fontSources[weight], size)
