import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { ToolboxIcon, VibrateIcon } from 'phosphor-react-native'
import { IconHero } from '@/components/ui/settings/IconHero'
import { theme } from '@/constants/theme'

const androidHaptics = Object.values(Haptics.AndroidHaptics).map((type) => ({
  label: type
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' '),
  type,
}))

export default function OtherSettingsScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <IconHero icon={ToolboxIcon} description="Small platform probes and local experiments." />
        <Text style={styles.sectionTitle}>Haptics</Text>

        <View style={styles.card}>
          {Platform.OS === 'android' ? (
            <View style={styles.controlGroup}>
              <View style={styles.controlHeader}>
                <View style={styles.rowIcon}>
                  <VibrateIcon size={20} color={theme.wheel.color} weight="duotone" />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowLabel}>Android haptics</Text>
                  <Text style={styles.rowHint}>Native performHapticFeedback constants</Text>
                </View>
              </View>
              <View style={styles.hapticGrid}>
                {androidHaptics.map((haptic) => (
                  <Pressable
                    key={haptic.type}
                    style={styles.hapticButton}
                    onPress={() => Haptics.performAndroidHapticsAsync(haptic.type)}
                  >
                    <Text style={styles.hapticButtonText}>{haptic.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : Platform.OS === 'web' ? (
            <View style={styles.row}>
              <Text style={styles.rowHint}>Haptics not available on web</Text>
            </View>
          ) : (
            <View style={styles.row}>
              <Text style={styles.rowHint}>Android haptic controls only</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
  },
  content: {
    padding: 16,
    gap: 8,
  },
  sectionTitle: {
    color: theme.neutral.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
    marginLeft: 4,
  },
  card: {
    backgroundColor: theme.neutral.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.neutral.surfaceDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: theme.neutral.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  rowHint: {
    color: theme.neutral.textMuted,
    fontSize: 12,
  },
  controlGroup: {
    padding: 14,
    gap: 12,
  },
  controlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hapticGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hapticButton: {
    backgroundColor: theme.neutral.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.neutral.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  hapticButtonText: {
    color: theme.neutral.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
})
