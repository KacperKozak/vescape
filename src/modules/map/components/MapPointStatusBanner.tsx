import { WarningCircleIcon } from 'phosphor-react-native'
import { StyleSheet, View } from 'react-native'

import { Text } from '@/components/base/Text'
import { theme } from '@/constants/theme'
import { useMapStore } from '@/modules/map/store/mapStore'

/**
 * Map Points come from the server and are not cached, so a failed read leaves an empty map that
 * would otherwise look like "no places here". This says which of the two it is, and warns when the
 * server returned only the nearest slice of a denser area.
 */
export function MapPointStatusBanner({ top }: { top: number }) {
  const error = useMapStore((state) => state.error)
  const truncated = useMapStore((state) => state.truncated)

  const message =
    error ?? (truncated ? 'Showing the closest map features only. Zoom in for more.' : null)
  if (!message) return null

  return (
    <View
      pointerEvents="none"
      style={[styles.banner, { top }, error ? styles.error : styles.notice]}
    >
      <WarningCircleIcon
        size={15}
        color={error ? theme.status.error.text : theme.palette.slate.textSecondary}
        weight="fill"
      />
      <Text style={[styles.text, error ? styles.errorText : undefined]} numberOfLines={2}>
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  notice: {
    backgroundColor: theme.alpha(theme.palette.slate.bg, 0.85),
    borderColor: theme.palette.slate.border,
  },
  error: {
    backgroundColor: theme.alpha(theme.status.error.bg, 0.85),
    borderColor: theme.status.error.border,
  },
  text: {
    flex: 1,
    fontFamily: theme.font('500'),
    fontSize: 12,
    color: theme.palette.slate.textSecondary,
  },
  errorText: {
    color: theme.status.error.text,
  },
})
