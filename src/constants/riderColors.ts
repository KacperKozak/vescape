import { palette } from '@/constants/theme'

/**
 * Curated marker-color choices a Rider can pick from. Palette-sourced and kept
 * generic — the chosen color tints the Rider's presence wherever it is shown
 * (today: the Group Ride map markers other Riders see).
 */
export const riderColorOptions: readonly string[] = [
  palette.sky.color,
  palette.cyan.color,
  palette.teal.color,
  palette.groupRide.color,
  palette.green.color,
  palette.amber.color,
  palette.orange.color,
  palette.red.color,
  palette.pink.color,
  palette.fuchsia.color,
  palette.purple.color,
  palette.violet.color,
  palette.yellow.color,
]
