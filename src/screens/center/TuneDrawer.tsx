import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native'
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { Text } from '@/components/base/Text'
import {
  ArrowsDownUpIcon,
  BellRingingIcon,
  FadersIcon,
  FootprintsIcon,
  GaugeIcon,
  LightbulbIcon,
  SirenIcon,
  SpeedometerIcon,
  WarningCircleIcon,
  type Icon,
} from 'phosphor-react-native'
import { router } from 'expo-router'

import { RemoteTiltControl } from '@/modules/board/components/RemoteTiltControl'
import { Input } from '@/components/forms/Input'
import { InfoModal } from '@/components/modals/InfoModal'
import {
  tuneProfileColorTheme,
  tuneProfileIconComponent,
} from '@/modules/tune/components/TuneProfileMetadataModal'
import { SelectWidget } from '@/components/widgets/SelectWidget'
import { StepperWidget } from '@/components/widgets/StepperWidget'
import { SwitchWidget } from '@/components/widgets/SwitchWidget'
import { widgetSurface } from '@/components/widgets/widgetSurface'
import { canRunFirmwareCommand } from '@/modules/board/lib/boardLinkIntegrity'
import {
  applyJurisdictionDefaults,
  normalizeLegalModeSettings,
  resolveJurisdictionFromLocation,
} from '@/modules/legal/lib/legalMode'
import { routes } from '@/navigation/routes'
import { theme } from '@/constants/theme'
import { useBleStore } from '@/modules/board/store/bleStore'
import { useBoardStore } from '@/modules/board/store/boardStore'
import { useLegalModeStore } from '@/modules/legal/store/legalModeStore'
import { useSettingsStore } from '@/modules/settings/store/settingsStore'
import { useTuneProfileStore } from '@/modules/tune/store/tuneProfileStore'
import {
  LEGAL_SPEED_DRAFT_COMMIT_DELAY_MS,
  hasSpeedDraftValue,
  parseSpeed,
} from '@/modules/legal/lib/speedDraft'

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
  const [legalSpeedDraft, setLegalSpeedDraft] = useState('')
  const [warningSpeedDraft, setWarningSpeedDraft] = useState('')
  const [editingLegalField, setEditingLegalField] = useState<'legal' | 'warning' | null>(null)
  const legalDraftRef = useRef({
    editingField: null as 'legal' | 'warning' | null,
    legalSpeedDraft: '',
    warningSpeedDraft: '',
    legalSpeedKmh: 0,
    warningSpeedKmh: 0,
    setLegalSpeed: (_speedKmh: number) => Promise.resolve(),
    setWarningSpeed: (_speedKmh: number) => Promise.resolve(),
  })
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
  const setLegalModeEnabled = useLegalModeStore((state) => state.setEnabled)
  const setLegalModeLegalSpeed = useLegalModeStore((state) => state.setLegalSpeed)
  const setLegalModeWarningSpeed = useLegalModeStore((state) => state.setWarningSpeed)
  const latestApproximateLocation = useBleStore((state) => state.latestApproximateLocation)
  const legalMode = useMemo(() => normalizeLegalModeSettings(rawLegalMode), [rawLegalMode])
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
    if (!latestApproximateLocation) return
    const jurisdiction = resolveJurisdictionFromLocation(latestApproximateLocation)
    if (!jurisdiction || legalMode.jurisdiction?.countryCode === jurisdiction.countryCode) return
    void setLegalModeSetting(applyJurisdictionDefaults(legalMode, jurisdiction)).catch(
      () => undefined,
    )
  }, [latestApproximateLocation, legalMode, setLegalModeSetting])

  useEffect(() => {
    legalDraftRef.current = {
      editingField: editingLegalField,
      legalSpeedDraft,
      warningSpeedDraft,
      legalSpeedKmh: legalMode.legalSpeedKmh,
      warningSpeedKmh: legalMode.warningSpeedKmh,
      setLegalSpeed: setLegalModeLegalSpeed,
      setWarningSpeed: setLegalModeWarningSpeed,
    }
  }, [
    editingLegalField,
    legalMode.legalSpeedKmh,
    legalMode.warningSpeedKmh,
    legalSpeedDraft,
    setLegalModeLegalSpeed,
    setLegalModeWarningSpeed,
    warningSpeedDraft,
  ])

  useEffect(() => {
    if (editingLegalField !== 'legal' || !hasSpeedDraftValue(legalSpeedDraft)) return
    const nextSpeed = parseSpeed(legalSpeedDraft, legalMode.legalSpeedKmh)
    if (nextSpeed === legalMode.legalSpeedKmh) return
    const timer = setTimeout(() => {
      void setLegalModeLegalSpeed(nextSpeed).catch(() => undefined)
    }, LEGAL_SPEED_DRAFT_COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [editingLegalField, legalMode.legalSpeedKmh, legalSpeedDraft, setLegalModeLegalSpeed])

  useEffect(() => {
    if (editingLegalField !== 'warning' || !hasSpeedDraftValue(warningSpeedDraft)) return
    const nextSpeed = parseSpeed(warningSpeedDraft, legalMode.warningSpeedKmh)
    if (nextSpeed === legalMode.warningSpeedKmh) return
    const timer = setTimeout(() => {
      void setLegalModeWarningSpeed(nextSpeed).catch(() => undefined)
    }, LEGAL_SPEED_DRAFT_COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [editingLegalField, legalMode.warningSpeedKmh, setLegalModeWarningSpeed, warningSpeedDraft])

  useEffect(() => {
    return () => {
      const draft = legalDraftRef.current
      if (draft.editingField === 'legal' && hasSpeedDraftValue(draft.legalSpeedDraft)) {
        void draft
          .setLegalSpeed(parseSpeed(draft.legalSpeedDraft, draft.legalSpeedKmh))
          .catch(() => undefined)
      }
      if (draft.editingField === 'warning' && hasSpeedDraftValue(draft.warningSpeedDraft)) {
        void draft
          .setWarningSpeed(parseSpeed(draft.warningSpeedDraft, draft.warningSpeedKmh))
          .catch(() => undefined)
      }
    }
  }, [])

  const openTune = () => {
    onNavigate()
    router.push(routes.tune)
  }

  const openProfile = (profileId: string) => {
    setActiveProfile(profileId)
    openTune()
  }

  const toggleLegalMode = (enabled: boolean) => {
    void setLegalModeEnabled(enabled).catch(() => undefined)
  }

  const commitLegalSpeed = (value: string) => {
    setEditingLegalField(null)
    void setLegalModeLegalSpeed(parseSpeed(value, legalMode.legalSpeedKmh)).catch(() => undefined)
  }
  const commitWarningSpeed = (value: string) => {
    setEditingLegalField(null)
    void setLegalModeWarningSpeed(parseSpeed(value, legalMode.warningSpeedKmh)).catch(
      () => undefined,
    )
  }

  const activeName =
    activeBoardId == null
      ? 'No board'
      : profilesLoadedForBoard
        ? (activeProfileForBoard?.name ?? (profileLoading ? 'Loading...' : 'No profile'))
        : 'Loading...'
  const legalModeDescription = `${legalMode.jurisdiction?.countryName ?? 'Current country'} · max ${legalMode.legalSpeedKmh} km/h`
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
        <View style={styles.wideCell}>
          <StepperWidget
            icon={ArrowsDownUpIcon}
            label="Move board"
            accent={theme.palette.cyan.color}
            disabled={!quickControlsEnabled}
            previousAccessibilityLabel="Move board down"
            nextAccessibilityLabel="Move board up"
            onPrevious={() => {}}
            onNext={() => {}}
          />
        </View>
      </View>

      <View style={styles.legalGroup}>
        <View style={styles.legalRow}>
          <LegalModeWidget
            value={legalMode.enabled}
            description={legalModeDescription}
            warning={showLegalWarning}
            onValueChange={toggleLegalMode}
            onWarningPress={() => setLegalWarningOpen(true)}
          />
          <View style={styles.legalRowDivider} />
          <View style={styles.legalMapCell}>
            <LegalMapWidget onPress={onOpenLegalLimits} />
          </View>
        </View>
        {legalMode.enabled ? (
          <View style={styles.legalSettingsBox}>
            <View style={styles.legalAlertSection}>
              <View style={styles.legalAlertTitleRow}>
                <BellRingingIcon size={24} color={theme.palette.amber.color} weight="duotone" />
                <Text style={styles.legalSettingsTitle}>Speed warning alert</Text>
              </View>
              <View style={styles.legalInputRow}>
                <View style={styles.legalInputCell}>
                  <Text style={styles.legalInputLabel}>Legal limit</Text>
                  <View style={styles.legalInputWrap}>
                    <Input
                      value={
                        editingLegalField === 'legal'
                          ? legalSpeedDraft
                          : String(legalMode.legalSpeedKmh)
                      }
                      onChangeText={setLegalSpeedDraft}
                      onFocus={() => {
                        setLegalSpeedDraft(String(legalMode.legalSpeedKmh))
                        setEditingLegalField('legal')
                      }}
                      onBlur={() => commitLegalSpeed(legalSpeedDraft)}
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
                      value={
                        editingLegalField === 'warning'
                          ? warningSpeedDraft
                          : String(legalMode.warningSpeedKmh)
                      }
                      onChangeText={setWarningSpeedDraft}
                      onFocus={() => {
                        setWarningSpeedDraft(String(legalMode.warningSpeedKmh))
                        setEditingLegalField('warning')
                      }}
                      onBlur={() => commitWarningSpeed(warningSpeedDraft)}
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
            </View>
            <View style={styles.legalSettingsDivider} />
            <View style={styles.legalMotorLimitColumn}>
              <View style={styles.legalMotorLimitRow}>
                <GaugeIcon size={24} color={theme.palette.red.light} weight="duotone" />
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

interface LegalModeWidgetProps {
  value: boolean
  description: string
  warning: boolean
  onValueChange: (value: boolean) => void
  onWarningPress: () => void
}

function LegalModeWidget({
  value,
  description,
  warning,
  onValueChange,
  onWarningPress,
}: LegalModeWidgetProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.legalModeCell,
        styles.legalModeWidget,
        pressed && styles.legalModeWidgetPressed,
      ]}
      accessibilityRole="switch"
      accessibilityLabel="Legal Mode"
      accessibilityState={{ checked: value }}
      onPress={() => onValueChange(!value)}
    >
      <SirenIcon size={22} color={theme.status.error.color} weight="duotone" />
      <View style={styles.legalModeText}>
        <View style={styles.legalModeTitleRow}>
          <Text style={styles.legalModeLabel} numberOfLines={1}>
            Legal mode
          </Text>
          {warning ? (
            <Pressable
              style={styles.legalWarningButton}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Legal road status warning"
              onPress={(event) => {
                event.stopPropagation()
                onWarningPress()
              }}
            >
              <WarningCircleIcon size={15} color={theme.status.error.color} weight="fill" />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.legalModeDescription} numberOfLines={1}>
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme.palette.slate.border,
          true: theme.alpha(theme.status.error.color, 0.6),
        }}
        thumbColor={value ? theme.status.error.color : theme.palette.slate.textMuted}
        ios_backgroundColor={theme.palette.slate.border}
        accessibilityLabel="Legal Mode"
      />
    </Pressable>
  )
}

function LegalMapWidget({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.legalMapWidget, pressed && styles.legalMapWidgetPressed]}
      accessibilityRole="button"
      accessibilityLabel="Legal limits map"
      onPress={onPress}
    >
      <SpeedometerIcon size={24} color={theme.palette.green.color} weight="duotone" />
      <View style={styles.legalMapText}>
        <Text style={styles.legalMapLabel} numberOfLines={1}>
          Map
        </Text>
        <Text style={styles.legalMapDescription} numberOfLines={1}>
          limits
        </Text>
      </View>
    </Pressable>
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
    gap: 12,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: theme.palette.slate.border,
  },
  legalSettingsTitle: {
    color: theme.palette.slate.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  legalAlertSection: {
    gap: 8,
  },
  legalAlertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legalInputRow: {
    marginLeft: 36,
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
  legalGroup: {
    ...widgetSurface,
    width: '100%',
    overflow: 'hidden',
  },
  legalRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  legalModeCell: {
    flex: 3,
    flexBasis: 0,
    minWidth: 0,
  },
  legalMapCell: {
    width: 82,
  },
  legalRowDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: theme.palette.slate.border,
  },
  legalModeWidget: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  legalModeWidgetPressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  legalModeText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  legalModeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legalModeLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  legalModeDescription: {
    color: theme.palette.slate.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  legalMapWidget: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  legalMapWidgetPressed: {
    backgroundColor: theme.palette.slate.surface,
  },
  legalMapText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  legalMapLabel: {
    color: theme.palette.slate.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  legalMapDescription: {
    color: theme.palette.slate.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  legalWarningButton: {
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
