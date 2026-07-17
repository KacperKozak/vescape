import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
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
  GaugeIcon,
  LightbulbIcon,
  MapTrifoldIcon,
  SirenIcon,
  WarningCircleIcon,
  type Icon,
} from 'phosphor-react-native'
import { router } from 'expo-router'

import { RemoteTiltControl } from '@/components/domain/control/RemoteTiltControl'
import { Input } from '@/components/ui/forms/Input'
import { InfoModal } from '@/components/ui/modals/InfoModal'
import {
  tuneProfileColorTheme,
  tuneProfileIconComponent,
} from '@/components/domain/tune/TuneProfileMetadataModal'
import { SelectWidget } from '@/components/widgets/SelectWidget'
import { StepperWidget } from '@/components/widgets/StepperWidget'
import { SwitchWidget } from '@/components/widgets/SwitchWidget'
import { widgetSurface } from '@/components/widgets/widgetSurface'
import { canRunFirmwareCommand } from '@/lib/boardLinkIntegrity'
import {
  LEGAL_MODE_ALERT_RULE_ID,
  applyJurisdictionDefaults,
  legalModeAlertRule,
  normalizeLegalModeSettings,
  resolveJurisdictionFromLocation,
  setLegalSpeed,
  setWarningSpeed,
} from '@/lib/legalMode'
import { routes } from '@/navigation/routes'
import { theme } from '@/constants/theme'
import { useAlertsStore } from '@/store/alertsStore'
import { useBleStore } from '@/store/bleStore'
import { useBoardStore } from '@/store/boardStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'

interface TuneDrawerProps {
  onNavigate: () => void
  onOpenLegalLimits: () => void
}

const PROFILE_OPTION_WIDTH = 46
const PROFILE_ACTIVE_WIDTH = 126
const PROFILE_ANIMATION = { duration: 180 } as const
const AnimatedText = Animated.createAnimatedComponent(Text)

export function TuneDrawer({ onNavigate, onOpenLegalLimits }: TuneDrawerProps) {
  const [tuneSelectOpen, setTuneSelectOpen] = useState(false)
  const [legalWarningOpen, setLegalWarningOpen] = useState(false)
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
  const rawLegalMode = useSettingsStore((state) => state.legalMode)
  const setLegalModeSetting = useSettingsStore((state) => state.setLegalMode)
  const latestApproximateLocation = useBleStore((state) => state.latestApproximateLocation)
  const upsertAlert = useAlertsStore((state) => state.upsert)
  const setAlertEnabled = useAlertsStore((state) => state.setEnabled)
  const alertRules = useAlertsStore((state) => state.rules)
  const legalMode = useMemo(() => normalizeLegalModeSettings(rawLegalMode), [rawLegalMode])
  const legalModeAlert = alertRules.find((rule) => rule.id === LEGAL_MODE_ALERT_RULE_ID)
  const showLegalWarning =
    legalMode.jurisdiction?.legalRoadStatus === 'restricted' ||
    legalMode.jurisdiction?.legalRoadStatus === 'notRoadLegal'
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

  useEffect(() => {
    if (legalMode.jurisdiction || !latestApproximateLocation) return
    const jurisdiction = resolveJurisdictionFromLocation(latestApproximateLocation)
    if (!jurisdiction) return
    void setLegalModeSetting(applyJurisdictionDefaults(legalMode, jurisdiction)).catch(
      () => undefined,
    )
  }, [latestApproximateLocation, legalMode, setLegalModeSetting])

  useEffect(() => {
    if (legalMode.enabled) {
      void upsertAlert(
        legalModeAlertRule(legalMode, legalModeAlert?.createdAt ?? Date.now()),
      ).catch(() => undefined)
    } else if (legalModeAlert?.enabled) {
      void setAlertEnabled(LEGAL_MODE_ALERT_RULE_ID, false).catch(() => undefined)
    }
  }, [legalMode, legalModeAlert?.createdAt, legalModeAlert?.enabled, setAlertEnabled, upsertAlert])

  const openTune = () => {
    onNavigate()
    router.push(routes.tune)
  }

  const openProfile = (profileId: string) => {
    setActiveProfile(profileId)
    openTune()
  }

  const updateLegalMode = (next: typeof legalMode) => {
    void setLegalModeSetting(next).catch(() => undefined)
  }

  const parseSpeed = (value: string, fallback: number) => {
    const normalized = Number(value.replace(',', '.').replace(/[^\d.]/g, ''))
    return Number.isFinite(normalized) ? normalized : fallback
  }
  const commitLegalSpeed = (value: string) =>
    updateLegalMode(setLegalSpeed(legalMode, parseSpeed(value, legalMode.legalSpeedKmh)))
  const commitWarningSpeed = (value: string) =>
    updateLegalMode(setWarningSpeed(legalMode, parseSpeed(value, legalMode.warningSpeedKmh)))

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
        label="Tune profiles"
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
        <View style={styles.moveLegalRow}>
          <Pressable
            style={({ pressed }) => [
              styles.legalIconButton,
              legalMode.enabled && styles.legalIconButtonActive,
              showLegalWarning && styles.legalIconButtonWarning,
              pressed && styles.legalIconButtonPressed,
            ]}
            accessibilityRole="switch"
            accessibilityLabel="Legal Mode"
            accessibilityState={{ checked: legalMode.enabled }}
            onPress={() => updateLegalMode({ ...legalMode, enabled: !legalMode.enabled })}
          >
            <SirenIcon
              size={24}
              color={theme.status.error.color}
              weight={legalMode.enabled ? 'fill' : 'duotone'}
            />
            {showLegalWarning ? (
              <Pressable
                style={styles.legalWarningButton}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Legal road status warning"
                onPress={(event) => {
                  event.stopPropagation()
                  setLegalWarningOpen(true)
                }}
              >
                <WarningCircleIcon size={15} color={theme.status.error.color} weight="fill" />
              </Pressable>
            ) : null}
          </Pressable>
          <View style={styles.moveBoardCell}>
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
        {legalMode.enabled ? (
          <View style={styles.wideCell}>
            <View style={styles.legalSettingsBox}>
              <Text style={styles.legalSettingsTitle}>Speed warning alert</Text>
              <View style={styles.legalInputRow}>
                <View style={styles.legalInputCell}>
                  <Text style={styles.legalInputLabel}>Legal speed limit</Text>
                  <View style={styles.legalInputWrap}>
                    <Input
                      key={`legal-speed-${legalMode.legalSpeedKmh}`}
                      defaultValue={String(legalMode.legalSpeedKmh)}
                      onEndEditing={(event) => commitLegalSpeed(event.nativeEvent.text)}
                      onSubmitEditing={(event) => commitLegalSpeed(event.nativeEvent.text)}
                      keyboardType="numeric"
                      returnKeyType="done"
                      maxLength={4}
                      style={styles.legalInput}
                      accessibilityLabel="Legal Speed Limit"
                    />
                    <Text style={styles.legalInputUnit}>km/h</Text>
                  </View>
                </View>
                <View style={styles.legalInputCell}>
                  <Text style={styles.legalInputLabel}>Alert starts</Text>
                  <View style={styles.legalInputWrap}>
                    <Input
                      key={`warning-speed-${legalMode.warningSpeedKmh}`}
                      defaultValue={String(legalMode.warningSpeedKmh)}
                      onEndEditing={(event) => commitWarningSpeed(event.nativeEvent.text)}
                      onSubmitEditing={(event) => commitWarningSpeed(event.nativeEvent.text)}
                      keyboardType="numeric"
                      returnKeyType="done"
                      maxLength={4}
                      style={styles.legalInput}
                      accessibilityLabel="Legal Warning Speed"
                    />
                    <Text style={styles.legalInputUnit}>km/h</Text>
                  </View>
                </View>
              </View>
              <View style={styles.legalSettingsDivider} />
              <View style={styles.legalMotorLimitColumn}>
                <View style={styles.legalMotorLimitRow}>
                  <GaugeIcon size={30} color={theme.palette.red.light} weight="duotone" />
                  <View style={styles.legalMotorLimitText}>
                    <Text style={styles.legalMotorLimitLabel}>Motor limit</Text>
                    <Text style={styles.legalMotorLimitWarning}>
                      Can cause nosedive. Disabled until tested.
                    </Text>
                  </View>
                  <Switch
                    value={false}
                    disabled
                    onValueChange={() => {}}
                    trackColor={{
                      false: theme.palette.slate.border,
                      true: theme.alpha(theme.palette.slate.textMuted, 0.6),
                    }}
                    thumbColor={theme.palette.slate.textMuted}
                    ios_backgroundColor={theme.palette.slate.border}
                    accessibilityLabel="Motor limit"
                  />
                </View>
              </View>
              <View style={styles.legalSettingsDivider} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Legal limits map"
                style={({ pressed }) => [
                  styles.legalMapButton,
                  pressed && styles.legalMapButtonPressed,
                ]}
                onPress={onOpenLegalLimits}
              >
                <MapTrifoldIcon size={30} color={theme.palette.sky.color} weight="duotone" />
                <View style={styles.legalMapButtonText}>
                  <Text style={styles.legalMapButtonLabel}>Legal limits map</Text>
                  <Text style={styles.legalMapButtonHint}>Country colors and speed defaults</Text>
                </View>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <InfoModal
        visible={legalWarningOpen}
        title="Legal Road Status"
        message={legalMode.jurisdiction?.warningText ?? 'This jurisdiction has restricted status.'}
        variant="warning"
        dismissLabel="Close"
        onDismiss={() => setLegalWarningOpen(false)}
      />
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
  legalSettingsBox: {
    ...widgetSurface,
    gap: 12,
    padding: 14,
  },
  legalSettingsTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  legalMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 2,
    paddingHorizontal: 0,
    borderRadius: 12,
  },
  legalMapButtonPressed: {
    backgroundColor: theme.alpha(theme.palette.slate.light, 0.12),
  },
  legalMapButtonText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  legalMapButtonLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  legalMapButtonHint: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  legalInputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  legalInputCell: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  legalSettingsDivider: {
    height: 1,
    marginHorizontal: -14,
    backgroundColor: theme.palette.slate.border,
  },
  legalMotorLimitColumn: {
    gap: 8,
    opacity: 0.45,
  },
  legalInputLabel: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  legalInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legalInput: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 9,
    textAlign: 'center',
  },
  legalInputUnit: {
    color: theme.palette.slate.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  legalMotorLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legalMotorLimitText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  legalMotorLimitLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  legalMotorLimitWarning: {
    color: theme.status.error.text,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  moveLegalRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  moveBoardCell: {
    flex: 1,
    minWidth: 0,
  },
  legalIconButton: {
    ...widgetSurface,
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  legalIconButtonActive: {
    backgroundColor: theme.status.error.bg,
    borderColor: theme.status.error.border,
  },
  legalIconButtonWarning: {
    borderColor: theme.status.error.border,
  },
  legalIconButtonPressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  legalWarningButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.palette.slate.surfaceDeep,
    borderWidth: 1,
    borderColor: theme.status.error.border,
  },
})
