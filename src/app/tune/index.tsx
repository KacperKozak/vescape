import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useNavigation, useRouter } from 'expo-router'
import {
  ArrowsClockwiseIcon,
  BluetoothSlashIcon,
  CheckIcon,
  ClockCounterClockwiseIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
} from 'phosphor-react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  getRefloatConfigSnapshot,
  type TuneProfile,
  type RefloatConfigField,
  type RefloatConfigGroup,
  type RefloatConfigSnapshot,
  type TuneProfileFieldValue,
} from 'vesc-ble'

import { Banner } from '@/components/Banner'
import { ConfirmModal } from '@/components/ConfirmModal'
import { InfoModal } from '@/components/InfoModal'
import { Placeholder } from '@/components/Placeholder'
import { BasicSliderCell } from '@/components/tune/BasicSliderCell'
import { FieldEditorPopover, type FieldEditorTarget } from '@/components/tune/FieldEditorPopover'
import { ProfilePills } from '@/components/tune/ProfilePills'
import { TuneConfigCell } from '@/components/tune/TuneConfigCell'
import { TuneGroupGrid } from '@/components/tune/TuneGroupGrid'
import { TuneSyncBar } from '@/components/tune/TuneSyncBar'
import { routes } from '@/navigation/routes'
import { useBoardStore, type Board } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'
import { APP_TUNE_GROUPS, APP_TUNE_FIELD_BY_ID, formatTuneValue } from '@/tune/fields'
import {
  BASIC_SLIDER_BY_ID,
  basicSlidersFromSnapshot,
  fieldHelp,
  fieldStep,
  getLinkedFieldPreviews,
  isEditableNumberField,
} from '@/tune/sliderDefinitions'
import { getSyncBarState } from '@/tune/syncBarState'

type LoadState =
  | { phase: 'loading'; snapshot: RefloatConfigSnapshot | null; error: string | null }
  | { phase: 'ready'; snapshot: RefloatConfigSnapshot; error: null }
  | { phase: 'error'; snapshot: RefloatConfigSnapshot | null; error: string }

type InfoModalState = { title: string; message: string } | null

type EditorKind = { kind: 'field'; fieldId: string } | { kind: 'basic'; sliderId: string }

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to read Refloat config.'
}

function isDisplayableFieldValue(
  value: TuneProfileFieldValue | undefined,
): value is number | boolean | string {
  return typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string'
}

function groupsWithProfileValues(
  groups: RefloatConfigGroup[],
  fields: Record<string, TuneProfileFieldValue> | null,
): RefloatConfigGroup[] {
  return groups.map((group) => ({
    ...group,
    fields: group.fields.map((field) => {
      const appField = APP_TUNE_FIELD_BY_ID.get(field.id)
      const profileValue = fields?.[field.id]
      return {
        ...field,
        label: appField?.label ?? field.label,
        unit: appField?.unit ?? field.unit,
        min: appField?.min ?? field.min,
        max: appField?.max ?? field.max,
        value: isDisplayableFieldValue(profileValue) ? profileValue : field.value,
      }
    }),
  }))
}

function snapshotFromTuneProfile(boardId: string, profile: TuneProfile): RefloatConfigSnapshot {
  return {
    capturedAt: Date.now(),
    boardId,
    canId: 0,
    schemaHash: 'app-tune-v1',
    rawConfigHash: '',
    rawConfigLength: 0,
    fwVersion: null,
    missingFieldIds: [],
    groups: APP_TUNE_GROUPS.map((group) => ({
      id: group.id,
      title: group.title,
      fields: group.fields.flatMap((field) => {
        const value = profile.fields[field.id]
        if (!isDisplayableFieldValue(value)) return []
        return [
          {
            id: field.id,
            label: field.label,
            value,
            unit: field.unit,
            min: field.min,
            max: field.max,
          },
        ]
      }),
    })).filter((group) => group.fields.length > 0),
  }
}

export default function TuneScreen() {
  const navigation = useNavigation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const bleStatus = useBleStore((s) => s.status)
  const boardConnected = bleStatus === 'connected'
  const allBoards = useBoardStore((s) => s.boards)
  const selectedBoardId = useBoardStore((s) => s.activeBoardId)
  const boardsLoaded = useBoardStore((s) => s.hasLoaded)
  const loadBoards = useBoardStore((s) => s.load)
  const profiles = useTuneProfileStore((s) => s.profiles)
  const activeProfile = useTuneProfileStore((s) => s.activeProfile)
  const draftFields = useTuneProfileStore((s) => s.draftFields)
  const hasDirtyFields = useTuneProfileStore((s) => s.hasDirtyFields)
  const savingProfile = useTuneProfileStore((s) => s.saving)
  const syncingProfile = useTuneProfileStore((s) => s.syncing)
  const profileError = useTuneProfileStore((s) => s.error)
  const boardDiff = useTuneProfileStore((s) => s.boardDiff)
  const hasBoardDiff = useTuneProfileStore((s) => s.hasBoardDiff)
  const loadProfiles = useTuneProfileStore((s) => s.loadProfiles)
  const setActiveProfile = useTuneProfileStore((s) => s.setActiveProfile)
  const storeCreateProfile = useTuneProfileStore((s) => s.createProfile)
  const storeRenameProfile = useTuneProfileStore((s) => s.renameProfile)
  const storeDeleteProfile = useTuneProfileStore((s) => s.deleteProfile)
  const storeCopyProfile = useTuneProfileStore((s) => s.copyProfileToBoard)
  const setDraftField = useTuneProfileStore((s) => s.setDraftField)
  const setBoardSnapshot = useTuneProfileStore((s) => s.setBoardSnapshot)
  const getDirtyFields = useTuneProfileStore((s) => s.getDirtyFields)
  const revertField = useTuneProfileStore((s) => s.revertField)
  const acceptBoardField = useTuneProfileStore((s) => s.acceptBoardField)
  const discardAllEdits = useTuneProfileStore((s) => s.discardAllEdits)
  const saveActiveProfile = useTuneProfileStore((s) => s.saveActiveProfile)
  const syncToBoard = useTuneProfileStore((s) => s.syncToBoard)
  const clearProfiles = useTuneProfileStore((s) => s.clear)

  const [state, setState] = useState<LoadState>({
    phase: 'loading',
    snapshot: null,
    error: null,
  })
  const [infoModal, setInfoModal] = useState<InfoModalState>(null)
  const [editor, setEditor] = useState<FieldEditorTarget | null>(null)
  const [editorKind, setEditorKind] = useState<EditorKind | null>(null)
  const [renameModalProfile, setRenameModalProfile] = useState<TuneProfile | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createCloneFromId, setCreateCloneFromId] = useState<string | undefined>()
  const [copySourceProfile, setCopySourceProfile] = useState<TuneProfile | null>(null)
  const [copyTargetBoard, setCopyTargetBoard] = useState<Board | null>(null)
  const [deleteConfirmProfile, setDeleteConfirmProfile] = useState<TuneProfile | null>(null)

  const cellRefs = useRef<Map<string, { current: View | null }>>(new Map())

  function getRef(id: string): { current: View | null } {
    if (!cellRefs.current.has(id)) {
      cellRefs.current.set(id, { current: null })
    }
    return cellRefs.current.get(id)!
  }

  const loadOnline = useCallback(async () => {
    setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const snapshot = await getRefloatConfigSnapshot()
      if (snapshot.boardId) {
        await loadProfiles(snapshot.boardId).catch(() => [])
      } else {
        clearProfiles()
      }
      setBoardSnapshot(snapshot)
      setState({ phase: 'ready', snapshot, error: null })
    } catch (error) {
      setState((current) => ({
        phase: 'error',
        snapshot: current.snapshot,
        error: errorMessage(error),
      }))
    }
  }, [clearProfiles, loadProfiles, setBoardSnapshot])

  const loadOffline = useCallback(
    async (boardId: string) => {
      setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
      try {
        const profileList = await loadProfiles(boardId)
        const profile = profileList[0]
        if (!profile) {
          throw new Error('No saved Tune Profile for this Board.')
        }
        const snapshot = snapshotFromTuneProfile(boardId, profile)
        setBoardSnapshot(null)
        setState({ phase: 'ready', snapshot, error: null })
      } catch (error) {
        setState((current) => ({
          phase: 'error',
          snapshot: current.snapshot,
          error: errorMessage(error),
        }))
      }
    },
    [loadProfiles, setBoardSnapshot],
  )

  useEffect(() => {
    if (!boardsLoaded) {
      void loadBoards()
    }
  }, [boardsLoaded, loadBoards])

  useEffect(() => {
    if (boardConnected) {
      void loadOnline()
    } else if (selectedBoardId) {
      void loadOffline(selectedBoardId)
    } else if (boardsLoaded) {
      clearProfiles()
      setBoardSnapshot(null)
      setState({ phase: 'loading', snapshot: null, error: null })
    }
  }, [
    boardConnected,
    boardsLoaded,
    clearProfiles,
    loadOffline,
    loadOnline,
    selectedBoardId,
    setBoardSnapshot,
  ])

  const openHistory = useCallback(() => {
    router.push(routes.tuneHistory)
  }, [router])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Tune',
      headerRight: () => (
        <View style={styles.headerActions}>
          {activeProfile ? (
            <Pressable style={styles.headerButton} onPress={() => void openHistory()}>
              <ClockCounterClockwiseIcon size={17} color="#cbd5e1" weight="bold" />
            </Pressable>
          ) : null}
          {boardConnected ? (
            <Pressable
              style={[
                styles.headerButton,
                state.phase === 'loading' && styles.headerButtonDisabled,
              ]}
              onPress={() => void loadOnline()}
              disabled={state.phase === 'loading'}
            >
              {state.phase === 'loading' ? (
                <ActivityIndicator size="small" color="#38bdf8" />
              ) : (
                <ArrowsClockwiseIcon size={17} color="#cbd5e1" weight="bold" />
              )}
            </Pressable>
          ) : null}
        </View>
      ),
    })
  }, [activeProfile, boardConnected, openHistory, loadOnline, navigation, state.phase])

  const snapshot = state.snapshot
  const profileFields = useMemo(
    () => (activeProfile ? { ...activeProfile.fields, ...draftFields } : null),
    [activeProfile, draftFields],
  )
  const displayGroups = useMemo(
    () => (snapshot ? groupsWithProfileValues(snapshot.groups, profileFields) : []),
    [profileFields, snapshot],
  )
  const displaySnapshot = useMemo(
    () => (snapshot ? { ...snapshot, groups: displayGroups } : null),
    [displayGroups, snapshot],
  )
  const basicSliders = useMemo(
    () => (displaySnapshot ? basicSlidersFromSnapshot(displaySnapshot) : []),
    [displaySnapshot],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dirtyFields = useMemo(() => getDirtyFields(), [getDirtyFields, draftFields, activeProfile])

  const schemaMismatchFields = useMemo(() => {
    if (!activeProfile || !snapshot) return null
    const boardFieldIds = new Set(snapshot.groups.flatMap((g) => g.fields.map((f) => f.id)))
    const profileFieldIds = Object.keys(activeProfile.fields)
    const profileOnly = profileFieldIds.filter((id) => !boardFieldIds.has(id))
    const boardOnly = [...boardFieldIds].filter(
      (id) => !Object.prototype.hasOwnProperty.call(activeProfile.fields, id),
    )
    if (profileOnly.length === 0 && boardOnly.length === 0) return null
    return { profileOnly, boardOnly }
  }, [activeProfile, snapshot])

  const boardDiffByField = useMemo(
    () => new Map(boardDiff.map((item) => [item.fieldId, item])),
    [boardDiff],
  )

  const syncBarState = useMemo(
    () =>
      getSyncBarState({
        hasProfile: activeProfile != null,
        bleStatus,
        hasDirtyFields,
        hasBoardDiff,
        dirtyCount: Object.keys(dirtyFields).length,
        diffCount: boardDiff.length,
        saving: savingProfile,
        syncing: syncingProfile,
      }),
    [
      activeProfile,
      bleStatus,
      hasDirtyFields,
      hasBoardDiff,
      dirtyFields,
      boardDiff,
      savingProfile,
      syncingProfile,
    ],
  )

  const showBadgeInfo = (title: string, message: string) => {
    setInfoModal({ title, message })
  }

  const showFieldInfo = (field: RefloatConfigField) => {
    const limits =
      field.min != null || field.max != null
        ? `\n\nRange: ${field.min != null ? formatTuneValue(field.min) : '-'} to ${
            field.max != null ? formatTuneValue(field.max) : '-'
          }${field.unit ? ` ${field.unit}` : ''}`
        : ''
    const units = field.unit ? `\nUnit: ${field.unit}` : ''
    setInfoModal({
      title: field.label,
      message: `${fieldHelp(field)}${units}${limits}\nField ID: ${field.id}`,
    })
  }

  const openFieldEditor = (field: RefloatConfigField, ref: { current: View | null }) => {
    if (!activeProfile) {
      showFieldInfo(field)
      return
    }
    if (!isEditableNumberField(field)) {
      showBadgeInfo(
        field.label,
        `${fieldHelp(field)}\n\nThis field is not numeric or has no schema bounds, so it cannot use the slider editor yet.\nField ID: ${field.id}`,
      )
      return
    }
    setEditorKind({ kind: 'field', fieldId: field.id })
    setEditor({
      triggerRef: ref as React.RefObject<View | null>,
      label: field.label,
      fieldId: field.id,
      value: field.value as number,
      min: field.min!,
      max: field.max!,
      step: fieldStep(field),
      unit: field.unit,
      help: fieldHelp(field),
    })
  }

  const openBasicSliderEditor = (sliderId: string, ref: { current: View | null }) => {
    if (!activeProfile) return
    const def = BASIC_SLIDER_BY_ID.get(sliderId)
    const item = basicSliders.find((s) => s.id === sliderId)
    if (!def || !item) return
    setEditorKind({ kind: 'basic', sliderId })
    setEditor({
      triggerRef: ref as React.RefObject<View | null>,
      label: item.label,
      fieldId: item.id,
      value: item.value ?? item.min,
      min: item.min,
      max: item.max,
      step: item.step,
      unit: null,
      help: item.info,
      linkedFields: getLinkedFieldPreviews(def),
    })
  }

  const handleEditorApply = (value: number) => {
    if (!editorKind) return
    if (editorKind.kind === 'field') {
      setDraftField(editorKind.fieldId, value)
    } else {
      const def = BASIC_SLIDER_BY_ID.get(editorKind.sliderId)
      if (def) {
        const fieldValues = def.computeFieldValues(value)
        for (const [id, v] of Object.entries(fieldValues)) {
          setDraftField(id, v)
        }
      }
    }
    setEditor(null)
    setEditorKind(null)
  }

  const closeEditor = () => {
    setEditor(null)
    setEditorKind(null)
  }

  const handleBasicSliderReset = (sliderId: string) => {
    const formula = BASIC_SLIDER_BY_ID.get(sliderId)
    if (!formula || !activeProfile) return
    const currentValue = formula.deriveSliderValue(
      new Map(
        Object.entries({ ...activeProfile.fields, ...draftFields })
          .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
          .map(([k, v]) => [k, v]),
      ),
    )
    if (currentValue == null) return
    const fieldValues = formula.computeFieldValues(Math.round(currentValue))
    for (const [fieldId, value] of Object.entries(fieldValues)) {
      setDraftField(fieldId, value)
    }
  }

  const handleCreateProfile = (cloneFromId?: string) => {
    setCreateCloneFromId(cloneFromId)
    setCreateModalOpen(true)
  }

  const handleCopyToBoard = (board: Board) => {
    setCopyTargetBoard(board)
  }

  const handleCopyConfirm = (name: string) => {
    if (!copySourceProfile || !copyTargetBoard) return
    void storeCopyProfile(copySourceProfile.id, copyTargetBoard.id, name)
    setCopySourceProfile(null)
    setCopyTargetBoard(null)
  }

  const otherBoards = useMemo(
    () => allBoards.filter((b) => b.id !== selectedBoardId),
    [allBoards, selectedBoardId],
  )

  const handleSave = () => {
    void saveActiveProfile().catch(() => undefined)
  }

  const handleSaveAndSync = () => {
    void (async () => {
      await saveActiveProfile()
      await syncToBoard()
    })().catch(() => undefined)
  }

  const handleSync = () => {
    void syncToBoard().catch(() => undefined)
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {!boardConnected && !selectedBoardId && boardsLoaded && !snapshot ? (
        <Placeholder
          icon={BluetoothSlashIcon}
          title="No board selected"
          description="Select a board to edit its saved Tune Profile"
        />
      ) : null}

      {state.phase === 'loading' && !snapshot && (boardConnected || selectedBoardId) ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.stateText}>
            {boardConnected ? 'Reading board config...' : 'Loading saved tune profile...'}
          </Text>
        </View>
      ) : null}

      {state.phase === 'error' && !snapshot ? (
        <View style={styles.centerState}>
          <WarningCircleIcon size={28} color="#f87171" />
          <Text style={styles.errorText}>{state.error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() =>
              boardConnected
                ? void loadOnline()
                : selectedBoardId
                  ? void loadOffline(selectedBoardId)
                  : undefined
            }
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {snapshot ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
          contentInsetAdjustmentBehavior="automatic"
        >
          <Banner
            variant="warning"
            title="Work in progress"
            message="Tune editing is experimental. Do not sync changes to the board until this feature is stable."
          />

          {state.phase === 'error' ? (
            <View style={styles.errorBanner}>
              <WarningCircleIcon size={16} color="#fca5a5" />
              <Text style={styles.errorBannerText}>{state.error}</Text>
            </View>
          ) : null}

          {profileError ? (
            <View style={styles.errorBanner}>
              <WarningCircleIcon size={16} color="#fca5a5" />
              <Text style={styles.errorBannerText}>{profileError}</Text>
            </View>
          ) : null}

          {schemaMismatchFields ? (
            <Pressable
              style={styles.schemaMismatchBar}
              onPress={() =>
                showBadgeInfo(
                  'Schema Mismatch',
                  `Profile and board have different field sets.${
                    schemaMismatchFields.profileOnly.length > 0
                      ? `\n\nIn profile but not board: ${schemaMismatchFields.profileOnly.join(', ')}`
                      : ''
                  }${
                    schemaMismatchFields.boardOnly.length > 0
                      ? `\n\nIn board but not profile: ${schemaMismatchFields.boardOnly.join(', ')}`
                      : ''
                  }`,
                )
              }
            >
              <WarningCircleIcon size={16} color="#fbbf24" weight="fill" />
              <View style={styles.schemaMismatchTextWrap}>
                <Text style={styles.schemaMismatchTitle}>Schema mismatch</Text>
                <Text style={styles.schemaMismatchText}>
                  {schemaMismatchFields.profileOnly.length > 0
                    ? `${schemaMismatchFields.profileOnly.length} field${schemaMismatchFields.profileOnly.length === 1 ? '' : 's'} in profile not on board`
                    : ''}
                  {schemaMismatchFields.profileOnly.length > 0 &&
                  schemaMismatchFields.boardOnly.length > 0
                    ? ' · '
                    : ''}
                  {schemaMismatchFields.boardOnly.length > 0
                    ? `${schemaMismatchFields.boardOnly.length} new field${schemaMismatchFields.boardOnly.length === 1 ? '' : 's'} on board`
                    : ''}
                </Text>
              </View>
            </Pressable>
          ) : null}

          {profiles.length > 0 ? (
            <ProfilePills
              profiles={profiles}
              activeProfileId={activeProfile?.id ?? null}
              canDelete={profiles.length > 1}
              hasOtherBoards={otherBoards.length > 0}
              onSelect={setActiveProfile}
              onCreate={() => handleCreateProfile(activeProfile?.id)}
              onRename={(profile) => setRenameModalProfile(profile)}
              onDelete={(profile) => setDeleteConfirmProfile(profile)}
              onCopy={(profile) => setCopySourceProfile(profile)}
            />
          ) : null}

          <View style={styles.metaRow}>
            {snapshot.fwVersion ? (
              <InfoBadge
                label={snapshot.fwVersion}
                onPress={() =>
                  showBadgeInfo(
                    'Firmware',
                    'Firmware reported by the connected controller. This is useful diagnostic context, but the config decoder uses the board XML schema as the source of truth.',
                  )
                }
              />
            ) : null}
            <InfoBadge
              label={`CAN ${snapshot.canId}`}
              onPress={() =>
                showBadgeInfo(
                  'CAN ID',
                  `Controller CAN ID ${snapshot.canId}. Refloat config commands are forwarded to this controller before reading the schema and binary config.`,
                )
              }
            />
            <InfoBadge
              label={`${snapshot.rawConfigLength} bytes`}
              onPress={() =>
                showBadgeInfo(
                  'Config Size',
                  `${snapshot.rawConfigLength} bytes is the size of the raw Refloat custom config payload read from the controller. The app decodes only known tune fields from that binary struct.`,
                )
              }
            />
            {snapshot.missingFieldIds.length > 0 ? (
              <InfoBadge
                label={`${snapshot.missingFieldIds.length} missing`}
                danger
                onPress={() =>
                  showBadgeInfo(
                    'Missing Fields',
                    `These allowlisted fields were not present in the board schema: ${snapshot.missingFieldIds.join(', ')}`,
                  )
                }
              />
            ) : null}
          </View>

          <TuneGroupGrid
            title="Basic"
            subtitle={activeProfile ? 'tap to adjust' : 'derived preview'}
          >
            {basicSliders.map((item) => (
              <BasicSliderCell
                key={item.id}
                ref={getRef(item.id) as React.RefObject<View>}
                item={item}
                editable={activeProfile != null}
                onPress={() => openBasicSliderEditor(item.id, getRef(item.id))}
                onInfo={() =>
                  showBadgeInfo(
                    item.label,
                    `${item.info}\n\nSource: ${item.source}\nRange: ${item.min} to ${item.max}, step ${item.step}`,
                  )
                }
                onResetFormula={() => handleBasicSliderReset(item.id)}
              />
            ))}
          </TuneGroupGrid>

          {displayGroups.map((group) => (
            <TuneGroupGrid
              key={group.id}
              title={group.title}
              subtitle={
                activeProfile
                  ? `${group.fields.length} profile values${
                      group.fields.some((field) => boardDiffByField.has(field.id))
                        ? ` - ${
                            group.fields.filter((field) => boardDiffByField.has(field.id)).length
                          } changed`
                        : ''
                    }`
                  : `${group.fields.length} read-only values`
              }
            >
              {group.fields.map((field) => (
                <TuneConfigCell
                  key={field.id}
                  ref={getRef(field.id) as React.RefObject<View>}
                  field={field}
                  savedValue={activeProfile?.fields[field.id]}
                  boardValue={boardDiffByField.get(field.id)?.boardValue}
                  profileValue={boardDiffByField.get(field.id)?.profileValue}
                  dirty={Object.prototype.hasOwnProperty.call(dirtyFields, field.id)}
                  boardChanged={boardDiffByField.has(field.id)}
                  onPress={() => openFieldEditor(field, getRef(field.id))}
                  onInfo={() => showFieldInfo(field)}
                  onRevert={() => revertField(field.id)}
                  onAcceptBoard={() => acceptBoardField(field.id)}
                />
              ))}
            </TuneGroupGrid>
          ))}
        </ScrollView>
      ) : null}

      {snapshot ? (
        <TuneSyncBar
          state={syncBarState}
          onSave={handleSave}
          onSaveAndSync={handleSaveAndSync}
          onSync={handleSync}
          onDiscard={discardAllEdits}
          bottomOffset={insets.bottom + 16}
        />
      ) : null}

      <InfoModal
        visible={infoModal != null}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onDismiss={() => setInfoModal(null)}
      />

      <FieldEditorPopover target={editor} onCancel={closeEditor} onApply={handleEditorApply} />

      <TextPromptModal
        visible={createModalOpen}
        title="New Profile"
        placeholder="Profile name"
        initialValue=""
        confirmLabel="Create"
        onConfirm={(name) => {
          void storeCreateProfile(name, createCloneFromId)
          setCreateModalOpen(false)
        }}
        onDismiss={() => setCreateModalOpen(false)}
      />

      <RenameProfileModal
        profile={renameModalProfile}
        onRename={(name) => {
          if (renameModalProfile) void storeRenameProfile(renameModalProfile.id, name)
          setRenameModalProfile(null)
        }}
        onDismiss={() => setRenameModalProfile(null)}
      />

      <BoardPickerModal
        visible={copySourceProfile != null && copyTargetBoard == null}
        boards={otherBoards}
        onSelect={handleCopyToBoard}
        onDismiss={() => setCopySourceProfile(null)}
      />

      <TextPromptModal
        visible={copyTargetBoard != null}
        title={`Copy to ${copyTargetBoard?.name ?? 'board'}`}
        placeholder="Profile name"
        initialValue={copySourceProfile ? `${copySourceProfile.name} (copy)` : ''}
        confirmLabel="Copy"
        onConfirm={handleCopyConfirm}
        onDismiss={() => {
          setCopyTargetBoard(null)
          setCopySourceProfile(null)
        }}
      />

      <ConfirmModal
        visible={deleteConfirmProfile != null}
        title="Delete Profile"
        message={`Delete "${deleteConfirmProfile?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteConfirmProfile) void storeDeleteProfile(deleteConfirmProfile.id)
          setDeleteConfirmProfile(null)
        }}
        onCancel={() => setDeleteConfirmProfile(null)}
      />
    </SafeAreaView>
  )
}

function InfoBadge({
  label,
  danger = false,
  onPress,
}: {
  label: string
  danger?: boolean
  onPress: () => void
}) {
  return (
    <Pressable style={[styles.metaBadge, danger && styles.metaBadgeDanger]} onPress={onPress}>
      <Text style={[styles.metaText, danger && styles.metaTextDanger]} selectable>
        {label}
      </Text>
      <InfoIcon size={12} color={danger ? '#fecaca' : '#64748b'} weight="bold" />
    </Pressable>
  )
}

function TextPromptModal({
  visible,
  title,
  placeholder,
  initialValue,
  confirmLabel,
  onConfirm,
  onDismiss,
}: {
  visible: boolean
  title: string
  placeholder?: string
  initialValue: string
  confirmLabel: string
  onConfirm: (value: string) => void
  onDismiss: () => void
}) {
  const [text, setText] = useState(initialValue)

  useEffect(() => {
    if (visible) setText(initialValue)
  }, [visible, initialValue])

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.modalBackdrop} onPress={onDismiss}>
        <Pressable style={styles.promptModal} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.promptTitle}>{title}</Text>
          <TextInput
            style={styles.promptInput}
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#475569"
            autoFocus
            selectTextOnFocus
          />
          <View style={styles.promptActions}>
            <Pressable style={styles.promptCancelBtn} onPress={onDismiss}>
              <Text style={styles.promptCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.promptConfirmBtn}
              onPress={() => text.trim() && onConfirm(text.trim())}
            >
              <CheckIcon size={15} color="#020617" weight="bold" />
              <Text style={styles.promptConfirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function RenameProfileModal({
  profile,
  onRename,
  onDismiss,
}: {
  profile: TuneProfile | null
  onRename: (name: string) => void
  onDismiss: () => void
}) {
  return (
    <TextPromptModal
      visible={profile != null}
      title="Rename Profile"
      initialValue={profile?.name ?? ''}
      confirmLabel="Rename"
      onConfirm={onRename}
      onDismiss={onDismiss}
    />
  )
}

function BoardPickerModal({
  visible,
  boards,
  onSelect,
  onDismiss,
}: {
  visible: boolean
  boards: Board[]
  onSelect: (board: Board) => void
  onDismiss: () => void
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.modalBackdrop} onPress={onDismiss}>
        <Pressable style={styles.promptModal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.promptHeader}>
            <Text style={styles.promptTitle}>Copy to board</Text>
            <Pressable style={styles.promptCloseBtn} onPress={onDismiss}>
              <XIcon size={14} color="#cbd5e1" weight="bold" />
            </Pressable>
          </View>
          {boards.length === 0 ? (
            <Text style={styles.emptyText}>No other boards available.</Text>
          ) : (
            boards.map((board) => (
              <Pressable
                key={board.id}
                style={styles.boardPickerItem}
                onPress={() => onSelect(board)}
              >
                <Text style={styles.boardPickerText}>{board.name}</Text>
              </Pressable>
            ))
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  headerButtonDisabled: {
    opacity: 0.7,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  stateText: {
    color: '#9ca3af',
    fontSize: 15,
  },
  errorText: {
    color: '#fecaca',
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#38bdf8',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#020617',
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: '#3f1111',
    borderColor: '#7f1d1d',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBannerText: {
    color: '#fecaca',
    flex: 1,
  },
  schemaMismatchBar: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#854d0e',
    backgroundColor: '#422006',
    padding: 12,
  },
  schemaMismatchTextWrap: {
    flex: 1,
    gap: 2,
  },
  schemaMismatchTitle: {
    color: '#fef3c7',
    fontSize: 13,
    fontWeight: '900',
  },
  schemaMismatchText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaBadge: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaBadgeDanger: {
    backgroundColor: '#7f1d1d',
    borderColor: '#991b1b',
  },
  metaText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  metaTextDanger: {
    color: '#fee2e2',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    padding: 32,
  },
  promptModal: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    gap: 14,
  },
  promptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  promptTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '900',
  },
  promptCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  promptInput: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  promptActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  promptCancelBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptCancelText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '800',
  },
  promptConfirmBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#38bdf8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  promptConfirmText: {
    color: '#020617',
    fontSize: 13,
    fontWeight: '900',
  },
  boardPickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
    minHeight: 44,
    justifyContent: 'center',
  },
  boardPickerText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },
})
