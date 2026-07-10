import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/components/ui/base/Text'
import {
  ArrowsDownUpIcon,
  FadersIcon,
  FootprintsIcon,
  LightbulbIcon,
  type Icon,
} from 'phosphor-react-native'
import { router } from 'expo-router'

import { RemoteTiltControl } from '@/components/domain/control/RemoteTiltControl'
import {
  tuneProfileColorTheme,
  tuneProfileIconComponent,
} from '@/components/domain/tune/TuneProfileMetadataModal'
import { SelectWidget } from '@/components/widgets/SelectWidget'
import { StepperWidget } from '@/components/widgets/StepperWidget'
import { SwitchWidget } from '@/components/widgets/SwitchWidget'
import { widgetSurface } from '@/components/widgets/widgetSurface'
import { canRunFirmwareCommand } from '@/lib/boardLinkIntegrity'
import { routes } from '@/navigation/routes'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'

interface TuneDrawerProps {
  onNavigate: () => void
}

const PROFILE_OPTION_WIDTH = 46
const PROFILE_ACTIVE_WIDTH = 126
const PROFILE_ANIMATION = { duration: 180 } as const
const AnimatedText = Animated.createAnimatedComponent(Text)

export function TuneDrawer({ onNavigate }: TuneDrawerProps) {
  const [tuneSelectOpen, setTuneSelectOpen] = useState(false)
  const activeBoardId = useBoardStore((state) => state.activeBoardId)
  const tuneCompatibility = useBoardStore(
    (state) =>
      state.boards.find((board) => board.id === state.activeBoardId)?.link?.refloatBaseVersion ??
      null,
  )
  const activeProfile = useTuneProfileStore((state) => state.activeProfile)
  const profiles = useTuneProfileStore((state) => state.profiles)
  const profileLoading = useTuneProfileStore((state) => state.loading)
  const profileBoardId = useTuneProfileStore((state) => state.activeBoardId)
  const profileCompatibility = useTuneProfileStore((state) => state.refloatBaseVersion)
  const loadProfiles = useTuneProfileStore((state) => state.loadProfiles)
  const setActiveProfile = useTuneProfileStore((state) => state.setActiveProfile)
  const profilesLoadedForBoard =
    activeBoardId != null &&
    profileBoardId === activeBoardId &&
    profileCompatibility === tuneCompatibility
  const boardConnected = useBleStore((state) => state.status === 'connected')
  const linkIntegrity = useBleStore((state) => state.linkIntegrity)
  const quickControlsEnabled = boardConnected && canRunFirmwareCommand(linkIntegrity)
  const waitingForTrustedLink = boardConnected && !quickControlsEnabled
  const profilesForBoard = profilesLoadedForBoard
    ? profiles.filter(
        (profile) =>
          profile.boardId === activeBoardId && profile.refloatBaseVersion === tuneCompatibility,
      )
    : []
  const activeProfileForBoard =
    profilesLoadedForBoard &&
    activeProfile?.boardId === activeBoardId &&
    activeProfile.refloatBaseVersion === tuneCompatibility
      ? activeProfile
      : null
  const hasProfiles = profilesForBoard.length > 0

  useEffect(() => {
    if (activeBoardId) void loadProfiles(activeBoardId, tuneCompatibility).catch(() => undefined)
  }, [activeBoardId, loadProfiles, tuneCompatibility])

  const openTune = () => {
    onNavigate()
    router.push(routes.tune)
  }

  const openProfile = (profileId: string) => {
    setActiveProfile(profileId)
    openTune()
  }

  const activeName =
    activeBoardId == null
      ? 'No board'
      : profilesLoadedForBoard
        ? (activeProfileForBoard?.name ?? (profileLoading ? 'Loading...' : 'No profile'))
        : 'Loading...'
  const SelectIcon = activeProfileForBoard
    ? tuneProfileIconComponent(activeProfileForBoard.icon)
    : undefined
  const selectTheme = activeProfileForBoard
    ? tuneProfileColorTheme(activeProfileForBoard.color)
    : tuneProfileColorTheme('purple')

  return (
    <View style={styles.content}>
      <SelectWidget
        icon={FadersIcon}
        selectIcon={SelectIcon}
        label="Tunes"
        value={activeName}
        description="Pick how your board should feel."
        accent={theme.palette.purple.color}
        selectAccent={selectTheme.color}
        selectBackground={selectTheme.bg}
        selectBorder={selectTheme.border}
        selectOpen={tuneSelectOpen}
        showSelect={hasProfiles}
        onPress={openTune}
        onSelectPress={() => setTuneSelectOpen((open) => !open)}
      />

      {tuneSelectOpen && hasProfiles ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.profilePills}
        >
          {profilesForBoard.map((profile) => {
            const active = profile.id === activeProfileForBoard?.id
            const Icon = tuneProfileIconComponent(profile.icon)
            const color = tuneProfileColorTheme(profile.color)
            return (
              <TuneProfilePill
                key={profile.id}
                label={profile.name}
                icon={Icon}
                active={active}
                color={color}
                onPress={() => openProfile(profile.id)}
              />
            )
          })}
        </ScrollView>
      ) : null}

      <View style={styles.remoteTiltBox}>
        <RemoteTiltControl collapsible defaultExpanded={false} />
      </View>

      {waitingForTrustedLink ? (
        <Text style={styles.quickDisabledNote}>Quick controls waiting for trusted board link.</Text>
      ) : null}

      <View style={styles.quickGrid}>
        <View style={styles.quickCell}>
          <SwitchWidget
            icon={LightbulbIcon}
            label="Lights"
            size="half"
            value={false}
            onValueChange={() => {}}
            accent={theme.palette.amber.color}
            disabled={!quickControlsEnabled}
          />
        </View>
        <View style={styles.quickCell}>
          <SwitchWidget
            icon={FootprintsIcon}
            label="Posi"
            size="half"
            value={false}
            onValueChange={() => {}}
            accent={theme.palette.green.color}
            disabled={!quickControlsEnabled}
          />
        </View>
        <View style={styles.wideCell}>
          <StepperWidget
            icon={ArrowsDownUpIcon}
            label="Move board"
            accent={theme.palette.cyan.color}
            disabled={!quickControlsEnabled}
            onPrevious={() => {}}
            onNext={() => {}}
          />
        </View>
      </View>
    </View>
  )
}

interface TuneProfilePillProps {
  label: string
  icon: Icon
  active: boolean
  color: ReturnType<typeof tuneProfileColorTheme>
  onPress: () => void
}

function TuneProfilePill({
  label,
  icon: IconComponent,
  active,
  color,
  onPress,
}: TuneProfilePillProps) {
  const fadedColor = theme.alpha(color.color, 0.6)
  const activeProgress = useSharedValue(active ? 1 : 0)

  useEffect(() => {
    activeProgress.value = withTiming(active ? 1 : 0, PROFILE_ANIMATION)
  }, [active, activeProgress])

  const frameStyle = useAnimatedStyle(
    () => ({
      width:
        PROFILE_OPTION_WIDTH + (PROFILE_ACTIVE_WIDTH - PROFILE_OPTION_WIDTH) * activeProgress.value,
      backgroundColor: interpolateColor(
        activeProgress.value,
        [0, 1],
        [theme.palette.slate.surfaceDeep, color.bg],
      ),
      borderColor: interpolateColor(
        activeProgress.value,
        [0, 1],
        [theme.palette.slate.border, color.border],
      ),
    }),
    [color.bg, color.border],
  )
  const labelStyle = useAnimatedStyle(
    () => ({
      opacity: activeProgress.value,
      maxWidth: PROFILE_ACTIVE_WIDTH * activeProgress.value,
      marginLeft: 7 * activeProgress.value,
    }),
    [],
  )

  return (
    <Animated.View style={[styles.profilePill, frameStyle]}>
      <Pressable
        style={({ pressed }) => [styles.profilePillPressable, pressed && styles.profilePillPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        onPress={onPress}
      >
        <IconComponent size={18} color={active ? color.color : fadedColor} weight="duotone" />
        <AnimatedText
          style={[
            styles.profilePillText,
            { color: active ? color.color : theme.palette.slate.textMuted },
            labelStyle,
          ]}
          numberOfLines={1}
        >
          {label}
        </AnimatedText>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  profilePills: {
    gap: 8,
    paddingRight: 8,
  },
  profilePill: {
    width: PROFILE_OPTION_WIDTH,
    height: PROFILE_OPTION_WIDTH,
    borderRadius: PROFILE_OPTION_WIDTH / 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  profilePillPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  profilePillPressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  profilePillText: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  remoteTiltBox: {
    ...widgetSurface,
    padding: 14,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickDisabledNote: {
    color: theme.palette.slate.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  quickCell: {
    width: '48%',
    flexGrow: 1,
  },
  wideCell: {
    width: '100%',
  },
})
