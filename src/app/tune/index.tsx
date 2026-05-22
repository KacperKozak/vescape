import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  FadersIcon,
  InfoIcon,
  WarningCircleIcon,
  XIcon,
} from 'phosphor-react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { type TuneProfile, type RefloatConfigField, type TuneProfileFieldValue } from 'vesc-ble'

import { Banner } from '@/components/Banner'
import { IconButton } from '@/components/IconButton'
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
import { type Board } from '@/store/boardStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'
import { formatTuneValue } from '@/tune/fields'
import {
  BASIC_SLIDER_BY_ID,
  fieldHelp,
  fieldStep,
  getLinkedFieldPreviews,
  isEditableNumberField,
  type BasicSliderItem,
} from '@/tune/sliderDefinitions'
import { useTuneScreenData } from '@/tune/useTuneScreenData'

type InfoModalState = { title: string; message: string } | null

type EditorKind = { kind: 'field'; fieldId: string } | { kind: 'basic'; sliderId: string }

export default function TuneScreen() {
  const navigation = useNavigation()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const {
    activeProfile,
    allBoards,
    basicSliders,
    boardConnected,
    boardDiffByField,
    boardSnapshot,
    boardSnapshotStatus,
    boardsLoaded,
    dirtyFields,
    displayGroups,
    draftFields,
    loadOffline,
    loadOnline,
    profileError,
    profileState,
    profiles,
    retryBoardSnapshot,
    schemaMismatchFields,
    selectedBoardId,
    syncBarState,
  } = useTuneScreenData()
  const setActiveProfile = useTuneProfileStore((s) => s.setActiveProfile)
  const storeCreateProfile = useTuneProfileStore((s) => s.createProfile)
  const storeRenameProfile = useTuneProfileStore((s) => s.renameProfile)
  const storeDeleteProfile = useTuneProfileStore((s) => s.deleteProfile)
  const storeCopyProfile = useTuneProfileStore((s) => s.copyProfileToBoard)
  const setDraftField = useTuneProfileStore((s) => s.setDraftField)
  const revertField = useTuneProfileStore((s) => s.revertField)
  const acceptBoardField = useTuneProfileStore((s) => s.acceptBoardField)
  const discardAllEdits = useTuneProfileStore((s) => s.discardAllEdits)
  const saveActiveProfile = useTuneProfileStore((s) => s.saveActiveProfile)
  const syncToBoard = useTuneProfileStore((s) => s.syncToBoard)
  const [infoModal, setInfoModal] = useState<InfoModalState>(null)
  const [editor, setEditor] = useState<FieldEditorTarget | null>(null)
  const [editorKind, setEditorKind] = useState<EditorKind | null>(null)
  const [renameModalProfile, setRenameModalProfile] = useState<TuneProfile | null>(null)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createCloneFromId, setCreateCloneFromId] = useState<string | undefined>()
  const [copySourceProfile, setCopySourceProfile] = useState<TuneProfile | null>(null)
  const [copyTargetBoard, setCopyTargetBoard] = useState<Board | null>(null)
  const [deleteConfirmProfile, setDeleteConfirmProfile] = useState<TuneProfile | null>(null)

  const openHistory = useCallback(() => {
    router.push(routes.tuneHistory)
  }, [router])

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Tune',
      headerRight: () => (
        <View style={styles.headerActions}>
          {activeProfile ? (
            <IconButton icon={ClockCounterClockwiseIcon} onPress={() => void openHistory()} />
          ) : null}
          {boardConnected ? (
            <IconButton
              icon={ArrowsClockwiseIcon}
              onPress={() => void loadOnline()}
              loading={boardSnapshotStatus === 'loading'}
            />
          ) : null}
        </View>
      ),
    })
  }, [activeProfile, boardConnected, boardSnapshotStatus, openHistory, loadOnline, navigation])

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

  const hasTuneView = activeProfile != null

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {!selectedBoardId && boardsLoaded && !hasTuneView ? (
        <Placeholder
          icon={BluetoothSlashIcon}
          title="No board selected"
          description="Select a board to edit its saved Tune Profile"
        />
      ) : null}

      {profileState.phase === 'loading' && !hasTuneView && selectedBoardId ? (
        <View style={styles.centerState}>
          <ActivityIndicator color="#38bdf8" />
          <Text style={styles.stateText}>Loading saved tune profile...</Text>
        </View>
      ) : null}

      {profileState.phase === 'empty' ? (
        <Placeholder
          icon={FadersIcon}
          title="No saved tunes"
          description="Connect to your board to read its current configuration and create your first Tune Profile"
        />
      ) : null}

      {profileState.phase === 'error' && !hasTuneView ? (
        <View style={styles.centerState}>
          <WarningCircleIcon size={28} color="#f87171" />
          <Text style={styles.errorText}>{profileState.error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => (selectedBoardId ? void loadOffline(selectedBoardId) : undefined)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {hasTuneView ? (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
          contentInsetAdjustmentBehavior="automatic"
        >
          <Banner
            variant="warning"
            title="Work in progress"
            message="Tune editing is experimental. Do not sync changes to the board until this feature is stable."
          />

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

          {boardSnapshot ? (
            <View style={styles.metaRow}>
              {boardSnapshot.fwVersion ? (
                <InfoBadge
                  label={boardSnapshot.fwVersion}
                  onPress={() =>
                    showBadgeInfo(
                      'Firmware',
                      'Firmware reported by the connected controller. This is useful diagnostic context, but the config decoder uses the board XML schema as the source of truth.',
                    )
                  }
                />
              ) : null}
              <InfoBadge
                label={`CAN ${boardSnapshot.canId}`}
                onPress={() =>
                  showBadgeInfo(
                    'CAN ID',
                    `Controller CAN ID ${boardSnapshot.canId}. Refloat config commands are forwarded to this controller before reading the schema and binary config.`,
                  )
                }
              />
              <InfoBadge
                label={`${boardSnapshot.rawConfigLength} bytes`}
                onPress={() =>
                  showBadgeInfo(
                    'Config Size',
                    `${boardSnapshot.rawConfigLength} bytes is the size of the raw Refloat custom config payload read from the controller. The app decodes only known tune fields from that binary struct.`,
                  )
                }
              />
              {boardSnapshot.missingFieldIds.length > 0 ? (
                <InfoBadge
                  label={`${boardSnapshot.missingFieldIds.length} missing`}
                  danger
                  onPress={() =>
                    showBadgeInfo(
                      'Missing Fields',
                      `These allowlisted fields were not present in the board schema: ${boardSnapshot.missingFieldIds.join(', ')}`,
                    )
                  }
                />
              ) : null}
            </View>
          ) : null}

          <TuneGroupGrid
            title="Basic"
            subtitle={activeProfile ? 'tap to adjust' : 'derived preview'}
          >
            {basicSliders.map((item) => (
              <BasicSliderItemCell
                key={item.id}
                item={item}
                editable={activeProfile != null}
                onPress={openBasicSliderEditor}
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
                <TuneFieldCell
                  key={field.id}
                  field={field}
                  savedValue={activeProfile?.fields[field.id]}
                  boardValue={boardDiffByField.get(field.id)?.boardValue}
                  profileValue={boardDiffByField.get(field.id)?.profileValue}
                  dirty={Object.prototype.hasOwnProperty.call(dirtyFields, field.id)}
                  boardChanged={boardDiffByField.has(field.id)}
                  onPress={openFieldEditor}
                  onInfo={() => showFieldInfo(field)}
                  onRevert={() => revertField(field.id)}
                  onAcceptBoard={() => acceptBoardField(field.id)}
                />
              ))}
            </TuneGroupGrid>
          ))}
        </ScrollView>
      ) : null}

      {hasTuneView ? (
        <TuneSyncBar
          state={syncBarState}
          onSave={handleSave}
          onSaveAndSync={handleSaveAndSync}
          onSync={handleSync}
          onDiscard={discardAllEdits}
          onRetryConfig={() => void retryBoardSnapshot()}
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

function BasicSliderItemCell({
  item,
  editable,
  onPress,
  onInfo,
  onResetFormula,
}: {
  item: BasicSliderItem
  editable: boolean
  onPress: (sliderId: string, ref: { current: View | null }) => void
  onInfo: () => void
  onResetFormula: () => void
}) {
  const cellRef = useRef<View | null>(null)
  return (
    <BasicSliderCell
      ref={cellRef}
      item={item}
      editable={editable}
      onPress={() => onPress(item.id, cellRef)}
      onInfo={onInfo}
      onResetFormula={onResetFormula}
    />
  )
}

function TuneFieldCell({
  field,
  savedValue,
  boardValue,
  profileValue,
  dirty,
  boardChanged,
  onPress,
  onInfo,
  onRevert,
  onAcceptBoard,
}: {
  field: RefloatConfigField
  savedValue: TuneProfileFieldValue | undefined
  boardValue: TuneProfileFieldValue | undefined
  profileValue: TuneProfileFieldValue | undefined
  dirty: boolean
  boardChanged: boolean
  onPress: (field: RefloatConfigField, ref: { current: View | null }) => void
  onInfo: () => void
  onRevert: () => void
  onAcceptBoard: () => void
}) {
  const cellRef = useRef<View | null>(null)
  return (
    <TuneConfigCell
      ref={cellRef}
      field={field}
      savedValue={savedValue}
      boardValue={boardValue}
      profileValue={profileValue}
      dirty={dirty}
      boardChanged={boardChanged}
      onPress={() => onPress(field, cellRef)}
      onInfo={onInfo}
      onRevert={onRevert}
      onAcceptBoard={onAcceptBoard}
    />
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      {visible ? (
        <TextPromptModalContent
          title={title}
          placeholder={placeholder}
          initialValue={initialValue}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      ) : null}
    </Modal>
  )
}

function TextPromptModalContent({
  title,
  placeholder,
  initialValue,
  confirmLabel,
  onConfirm,
  onDismiss,
}: {
  title: string
  placeholder?: string
  initialValue: string
  confirmLabel: string
  onConfirm: (value: string) => void
  onDismiss: () => void
}) {
  const [text, setText] = useState(initialValue)
  return (
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
