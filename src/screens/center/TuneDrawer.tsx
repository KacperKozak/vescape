import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { Text } from '@/components/ui/base/Text'
import { ArrowsDownUpIcon, FadersIcon, FootprintsIcon, LightbulbIcon } from 'phosphor-react-native'
import { router } from 'expo-router'

import { RemoteTiltControl } from '@/components/domain/control/RemoteTiltControl'
import { SelectWidget } from '@/components/widgets/SelectWidget'
import { StepperWidget } from '@/components/widgets/StepperWidget'
import { SwitchWidget } from '@/components/widgets/SwitchWidget'
import { widgetSurface } from '@/components/widgets/widgetSurface'
import { routes } from '@/navigation/routes'
import { theme } from '@/constants/theme'
import { useBoardStore } from '@/store/boardStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'

interface TuneDrawerProps {
  onNavigate: () => void
}

export function TuneDrawer({ onNavigate }: TuneDrawerProps) {
  const [tuneSelectOpen, setTuneSelectOpen] = useState(false)
  const activeBoardId = useBoardStore((state) => state.activeBoardId)
  const activeProfile = useTuneProfileStore((state) => state.activeProfile)
  const profiles = useTuneProfileStore((state) => state.profiles)
  const profileLoading = useTuneProfileStore((state) => state.loading)
  const profileBoardId = useTuneProfileStore((state) => state.activeBoardId)
  const loadProfiles = useTuneProfileStore((state) => state.loadProfiles)
  const setActiveProfile = useTuneProfileStore((state) => state.setActiveProfile)
  const profilesLoadedForBoard = activeBoardId != null && profileBoardId === activeBoardId
  const profilesForBoard = profilesLoadedForBoard
    ? profiles.filter((profile) => profile.boardId === activeBoardId)
    : []
  const activeProfileForBoard =
    profilesLoadedForBoard && activeProfile?.boardId === activeBoardId ? activeProfile : null
  const hasProfiles = profilesForBoard.length > 0

  useEffect(() => {
    if (activeBoardId) void loadProfiles(activeBoardId).catch(() => undefined)
  }, [activeBoardId, loadProfiles])

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

  return (
    <View style={styles.content}>
      <SelectWidget
        icon={FadersIcon}
        label="Tunes"
        value={activeName}
        description="Profiles are saved in app. Editing opens Tune page for now."
        accent={theme.palette.sky.color}
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
            return (
              <Pressable
                key={profile.id}
                style={({ pressed }) => [
                  styles.profilePill,
                  active && styles.profilePillActive,
                  pressed && styles.profilePillPressed,
                ]}
                onPress={() => openProfile(profile.id)}
              >
                <Text
                  style={[styles.profilePillText, active && styles.profilePillTextActive]}
                  numberOfLines={1}
                >
                  {profile.name}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}

      <View style={styles.remoteTiltBox}>
        <RemoteTiltControl collapsible defaultExpanded={false} />
      </View>

      <View style={styles.quickGrid}>
        <View style={styles.quickCell}>
          <SwitchWidget
            icon={LightbulbIcon}
            label="Lights"
            size="half"
            value={false}
            onValueChange={() => {}}
            accent={theme.palette.amber.color}
            disabled
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
            disabled
          />
        </View>
        <View style={styles.wideCell}>
          <StepperWidget
            icon={ArrowsDownUpIcon}
            label="Move board"
            accent={theme.palette.purple.color}
            disabled
            onPrevious={() => {}}
            onNext={() => {}}
          />
        </View>
      </View>
    </View>
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
    maxWidth: 150,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.palette.slate.border,
    backgroundColor: theme.palette.slate.surfaceDeep,
  },
  profilePillActive: {
    borderColor: theme.palette.sky.color,
  },
  profilePillPressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  profilePillText: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  profilePillTextActive: {
    color: theme.palette.sky.text,
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
  quickCell: {
    width: '48%',
    flexGrow: 1,
  },
  wideCell: {
    width: '100%',
  },
})
