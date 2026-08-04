import { useMemo } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import {
  useDerivedValue,
  useSharedValue,
  type DerivedValue,
  type SharedValue,
} from 'react-native-reanimated'
import { Canvas, Text as SkiaText } from '@shopify/react-native-skia'

import { theme, type MonoWeight } from '@/constants/theme'
import { useSkiaMonoFont } from '@/hooks/useSkiaFont'

export type MonoValueAlign = 'left' | 'center' | 'right'

export interface MonoValueProps {
  /** Live text driven off the UI thread. Updates never re-render React. */
  text: DerivedValue<string>
  size: number
  weight?: MonoWeight
  /** Static color, or a shared value for colors that ramp with the value. */
  color?: string | SharedValue<string>
  align?: MonoValueAlign
  /** Fixed canvas width. Omit to stretch and measure the box on layout. */
  width?: number
  /** Canvas height. Defaults to a line box derived from `size`. */
  height?: number
  style?: StyleProp<ViewStyle>
}

/** Line box around a glyph size, matching the ~1.3 leading RN applies by default. */
const LINE_RATIO = 1.3

/**
 * Live numeric/textual readout drawn straight onto a Skia canvas.
 *
 * Readouts used to be non-editable `TextInput`s written through `animatedProps`
 * (the classic Reanimated trick). That routes every tick through the shadow
 * tree: on Android the chained `AndroidTextInputState` commits overflowed the
 * GC thread stack, and on iOS a text commit racing the UI-thread prop write
 * could blank the value mid-ride. Skia draws bypass the shadow tree entirely,
 * so a tick is a repaint and nothing else.
 *
 * The canvas is one native surface per readout — cheap, but batch a cluster of
 * values into a single `MonoValue` string where the layout allows it rather
 * than mounting a canvas per digit group.
 */
export function MonoValue({
  text,
  size,
  weight = '700',
  color = theme.palette.slate.textPrimary,
  align = 'left',
  width,
  height,
  style,
}: MonoValueProps) {
  const font = useSkiaMonoFont(weight, size)
  const lineHeight = height ?? Math.ceil(size * LINE_RATIO)
  // `onLayout` is unsupported on Fabric canvases; `onSize` reports the measured
  // box straight into a shared value, so alignment stays off the JS thread.
  const canvasSize = useSharedValue({ width: width ?? 0, height: lineHeight })

  // Vertically center the glyph box: ascent is negative, descent positive.
  const baseline = useMemo(() => {
    if (!font) return 0
    const { ascent, descent } = font.getMetrics()
    return lineHeight / 2 - (ascent + descent) / 2
  }, [font, lineHeight])

  const x = useDerivedValue(() => {
    if (!font || align === 'left') return 0
    const free = (width ?? canvasSize.value.width) - font.getTextWidth(text.value)
    return align === 'center' ? free / 2 : free
  })

  return (
    <Canvas
      style={[{ height: lineHeight }, width == null ? null : { width }, style]}
      onSize={canvasSize}
      pointerEvents="none"
    >
      {font ? <SkiaText x={x} y={baseline} text={text} font={font} color={color} /> : null}
    </Canvas>
  )
}
