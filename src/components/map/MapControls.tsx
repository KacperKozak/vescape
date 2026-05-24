import { Pressable, StyleSheet, View } from 'react-native'
import { ArrowUpIcon, CrosshairIcon, CrosshairSimpleIcon, XIcon } from 'phosphor-react-native'
import { theme } from '@/constants/theme'

interface MapControlsProps {
  heading: number
  rotationLocked: boolean
  followGps: boolean
  showClearTarget: boolean
  onToggleRotationLock: () => void
  onRecenter: () => void
  onClearTarget: () => void
}

export function MapControls({
  heading,
  rotationLocked,
  followGps,
  showClearTarget,
  onToggleRotationLock,
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
        style={[styles.compassButton, !rotationLocked && styles.compassButtonUnlocked]}
        onPress={onToggleRotationLock}
      >
        <View style={{ transform: [{ rotate: `${-heading}deg` }] }}>
          <ArrowUpIcon
            size={22}
            color={rotationLocked ? '#f9fafb' : theme.gps.text}
            weight="bold"
          />
        </View>
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
    bottom: 166,
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
  compassButtonUnlocked: {
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
