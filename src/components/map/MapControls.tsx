import { Pressable, StyleSheet, View } from 'react-native'
import {
  ArrowUpIcon,
  CubeIcon,
  CrosshairIcon,
  CrosshairSimpleIcon,
  XIcon,
} from 'phosphor-react-native'
import { theme } from '@/constants/theme'

interface MapControlsProps {
  heading: number
  rotationLocked: boolean
  perspectiveEnabled: boolean
  followGps: boolean
  showClearTarget: boolean
  onResetRotation: () => void
  onToggleRotationLock: () => void
  onTogglePerspective: () => void
  onRecenter: () => void
  onClearTarget: () => void
}

export function MapControls({
  heading,
  rotationLocked,
  perspectiveEnabled,
  followGps,
  showClearTarget,
  onResetRotation,
  onToggleRotationLock,
  onTogglePerspective,
  onRecenter,
  onClearTarget,
}: MapControlsProps) {
  return (
    <>
      {showClearTarget && (
        <Pressable style={styles.clearTargetButton} onPress={onClearTarget}>
          <XIcon size={18} color="#f9fafb" weight="bold" />
        </Pressable>
      )}

      <Pressable
        style={[styles.compassButton, rotationLocked && styles.compassButtonLocked]}
        onPress={onResetRotation}
        onLongPress={onToggleRotationLock}
        delayLongPress={400}
      >
        <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
          <ArrowUpIcon
            size={22}
            color={rotationLocked ? theme.warning.color : '#f9fafb'}
            weight="bold"
          />
        </View>
      </Pressable>

      <Pressable
        style={[styles.perspectiveButton, perspectiveEnabled && styles.perspectiveButtonActive]}
        onPress={onTogglePerspective}
      >
        <CubeIcon
          size={22}
          color={perspectiveEnabled ? theme.gps.text : '#f9fafb'}
          weight={perspectiveEnabled ? 'fill' : 'bold'}
        />
      </Pressable>

      <Pressable
        style={[styles.followButton, followGps && styles.followButtonActive]}
        onPress={onRecenter}
      >
        {followGps ? (
          <CrosshairIcon size={24} color={theme.gps.text} weight="fill" />
        ) : (
          <CrosshairSimpleIcon size={24} color="#f9fafb" weight="bold" />
        )}
      </Pressable>
    </>
  )
}

const styles = StyleSheet.create({
  clearTargetButton: {
    position: 'absolute',
    right: 12,
    bottom: 226,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30,19,56,0.9)',
    borderRadius: 26,
  },
  compassButton: {
    position: 'absolute',
    right: 12,
    bottom: 106,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 26,
  },
  compassButtonLocked: {
    backgroundColor: 'rgba(67,20,7,0.9)',
  },
  perspectiveButton: {
    position: 'absolute',
    right: 12,
    bottom: 166,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 26,
  },
  perspectiveButtonActive: {
    backgroundColor: theme.gps.bg,
  },
  followButton: {
    position: 'absolute',
    right: 12,
    bottom: 46,
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,24,39,0.9)',
    borderRadius: 26,
  },
  followButtonActive: {
    backgroundColor: theme.gps.bg,
  },
})
