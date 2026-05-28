import { useCallback, useLayoutEffect, useRef } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRouter } from 'expo-router'
import {
  ArrowsClockwiseIcon,
  BluetoothSlashIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  FadersIcon,
  PencilSimpleIcon,
  TrashIcon,
  WarningCircleIcon,
} from 'phosphor-react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { type TuneProfile, type RefloatConfigField, type TuneProfileFieldValue } from 'vesc-ble'

import { Banner } from '@/components/ui/base/Banner'
import { IconButton } from '@/components/ui/base/IconButton'
import { ConfirmModal } from '@/components/ui/modals/ConfirmModal'
import { InfoModal } from '@/components/ui/modals/InfoModal'
import { Placeholder } from '@/components/ui/base/Placeholder'
import { BasicSliderCell } from '@/components/ui/tune/BasicSliderCell'
import { FieldEditorPopover } from '@/components/domain/tune/FieldEditorPopover'
import { HPill, HPillAdd, HPillMenuItem, HPills } from '@/components/ui/menus/HPills'
import { TuneConfigCell } from '@/components/domain/tune/TuneConfigCell'
import { TuneGroupGrid } from '@/components/ui/tune/TuneGroupGrid'
import { TuneSyncBar } from '@/components/ui/tune/TuneSyncBar'
import { routes } from '@/navigation/routes'
import { TextPromptModal } from '@/components/ui/modals/TextPromptModal'
import { BoardPickerModal } from '@/components/domain/tune/BoardPickerModal'
import { InfoBadge } from '@/components/ui/base/InfoBadge'
import { useTuneProfileStore } from '@/store/tuneProfileStore'
import type { BasicSliderItem } from '@/lib/tune/sliderDefinitions'
import { useTuneScreenData } from '@/hooks/useTuneScreenData'
import { theme } from '@/constants/theme'
import { useTuneModals } from '@/hooks/useTuneModals'

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
  const revertField = useTuneProfileStore((s) => s.revertField)
  const acceptBoardField = useTuneProfileStore((s) => s.acceptBoardField)
  const discardAllEdits = useTuneProfileStore((s) => s.discardAllEdits)
  const saveActiveProfile = useTuneProfileStore((s) => s.saveActiveProfile)
  const syncToBoard = useTuneProfileStore((s) => s.syncToBoard)

  const modals = useTuneModals(activeProfile, basicSliders, draftFields, allBoards, selectedBoardId)

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
          <ActivityIndicator color={theme.wheel.color} />
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
          <WarningCircleIcon size={28} color={theme.error.text} />
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
              <WarningCircleIcon size={16} color={theme.error.color} />
              <Text style={styles.errorBannerText}>{profileError}</Text>
            </View>
          ) : null}

          {schemaMismatchFields ? (
            <Pressable
              style={styles.schemaMismatchBar}
              onPress={() =>
                modals.showBadgeInfo(
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
              <WarningCircleIcon size={16} color={theme.highlight.color} weight="fill" />
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
            <HPills activeId={activeProfile?.id ?? ''}>
              {profiles.map((profile) => (
                <HPill
                  key={profile.id}
                  id={profile.id}
                  label={profile.name}
                  color={theme.wheel}
                  onPress={() => setActiveProfile(profile.id)}
                >
                  <HPillMenuItem
                    icon={PencilSimpleIcon}
                    label="Rename"
                    onPress={() => modals.setRenameModalProfile(profile)}
                  />
                  {modals.otherBoards.length > 0 ? (
                    <HPillMenuItem
                      icon={CopyIcon}
                      label="Copy to board"
                      onPress={() => modals.setCopySourceProfile(profile)}
                    />
                  ) : null}
                  {profiles.length > 1 ? (
                    <HPillMenuItem
                      icon={TrashIcon}
                      label="Delete"
                      onPress={() => modals.setDeleteConfirmProfile(profile)}
                      danger
                      separator
                    />
                  ) : null}
                </HPill>
              ))}
              <HPillAdd onPress={() => modals.handleCreateProfile(activeProfile?.id)} />
            </HPills>
          ) : null}

          {boardSnapshot ? (
            <View style={styles.metaRow}>
              {boardSnapshot.fwVersion ? (
                <InfoBadge
                  label={boardSnapshot.fwVersion}
                  onPress={() =>
                    modals.showBadgeInfo(
                      'Firmware',
                      'Firmware reported by the connected controller. This is useful diagnostic context, but the config decoder uses the board XML schema as the source of truth.',
                    )
                  }
                />
              ) : null}
              <InfoBadge
                label={`CAN ${boardSnapshot.canId}`}
                onPress={() =>
                  modals.showBadgeInfo(
                    'CAN ID',
                    `Controller CAN ID ${boardSnapshot.canId}. Refloat config commands are forwarded to this controller before reading the schema and binary config.`,
                  )
                }
              />
              <InfoBadge
                label={`${boardSnapshot.rawConfigLength} bytes`}
                onPress={() =>
                  modals.showBadgeInfo(
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
                    modals.showBadgeInfo(
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
                onPress={modals.openBasicSliderEditor}
                onInfo={() =>
                  modals.showBadgeInfo(
                    item.label,
                    `${item.info}\n\nSource: ${item.source}\nRange: ${item.min} to ${item.max}, step ${item.step}`,
                  )
                }
                onResetFormula={() => modals.handleBasicSliderReset(item.id)}
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
                  onPress={modals.openFieldEditor}
                  onInfo={() => modals.showFieldInfo(field)}
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
        visible={modals.infoModal != null}
        title={modals.infoModal?.title ?? ''}
        message={modals.infoModal?.message ?? ''}
        onDismiss={() => modals.setInfoModal(null)}
      />

      <FieldEditorPopover
        target={modals.editor}
        onCancel={modals.closeEditor}
        onApply={modals.handleEditorApply}
      />

      <TextPromptModal
        visible={modals.createModalOpen}
        title="New Profile"
        placeholder="Profile name"
        initialValue=""
        confirmLabel="Create"
        onConfirm={(name) => {
          void modals.storeCreateProfile(name, modals.createCloneFromId)
          modals.setCreateModalOpen(false)
        }}
        onDismiss={() => modals.setCreateModalOpen(false)}
      />

      <RenameProfileModal
        profile={modals.renameModalProfile}
        onRename={(name) => {
          if (modals.renameModalProfile)
            void modals.storeRenameProfile(modals.renameModalProfile.id, name)
          modals.setRenameModalProfile(null)
        }}
        onDismiss={() => modals.setRenameModalProfile(null)}
      />

      <BoardPickerModal
        visible={modals.copySourceProfile != null && modals.copyTargetBoard == null}
        boards={modals.otherBoards}
        onSelect={modals.handleCopyToBoard}
        onDismiss={() => modals.setCopySourceProfile(null)}
      />

      <TextPromptModal
        visible={modals.copyTargetBoard != null}
        title={`Copy to ${modals.copyTargetBoard?.name ?? 'board'}`}
        placeholder="Profile name"
        initialValue={modals.copySourceProfile ? `${modals.copySourceProfile.name} (copy)` : ''}
        confirmLabel="Copy"
        onConfirm={modals.handleCopyConfirm}
        onDismiss={() => {
          modals.setCopyTargetBoard(null)
          modals.setCopySourceProfile(null)
        }}
      />

      <ConfirmModal
        visible={modals.deleteConfirmProfile != null}
        title="Delete Profile"
        message={`Delete "${modals.deleteConfirmProfile?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (modals.deleteConfirmProfile)
            void modals.storeDeleteProfile(modals.deleteConfirmProfile.id)
          modals.setDeleteConfirmProfile(null)
        }}
        onCancel={() => modals.setDeleteConfirmProfile(null)}
      />
    </SafeAreaView>
  )
}

interface BasicSliderItemCellProps {
  item: BasicSliderItem
  editable: boolean
  onPress: (sliderId: string, ref: { current: View | null }) => void
  onInfo: () => void
  onResetFormula: () => void
}

function BasicSliderItemCell({
  item,
  editable,
  onPress,
  onInfo,
  onResetFormula,
}: BasicSliderItemCellProps) {
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

interface TuneFieldCellProps {
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
}: TuneFieldCellProps) {
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

interface RenameProfileModalProps {
  profile: TuneProfile | null
  onRename: (name: string) => void
  onDismiss: () => void
}

function RenameProfileModal({ profile, onRename, onDismiss }: RenameProfileModalProps) {
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.neutral.bg,
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
    color: theme.neutral.textSecondary,
    fontSize: 15,
  },
  errorText: {
    color: theme.error.text,
    fontSize: 15,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: theme.wheel.color,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: theme.neutral.surfaceDeep,
    fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    backgroundColor: theme.error.bg,
    borderColor: theme.error.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorBannerText: {
    color: theme.error.text,
    flex: 1,
  },
  schemaMismatchBar: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.highlight.border,
    backgroundColor: theme.highlight.bg,
    padding: 12,
  },
  schemaMismatchTextWrap: {
    flex: 1,
    gap: 2,
  },
  schemaMismatchTitle: {
    color: theme.highlight.text,
    fontSize: 13,
    fontWeight: '900',
  },
  schemaMismatchText: {
    color: theme.highlight.color,
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
})
