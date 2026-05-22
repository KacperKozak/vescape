import { useCallback, useEffect, useMemo } from 'react'
import {
  type RefloatConfigGroup,
  type RefloatConfigSnapshot,
  type TuneProfileFieldValue,
} from 'vesc-ble'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'
import { useTuneSnapshotStore } from '@/store/tuneSnapshotStore'
import { APP_TUNE_FIELD_BY_ID, APP_TUNE_GROUPS } from '@/tune/fields'
import { isDisplayableFieldValue } from '@/tune/fieldValues'
import { basicSlidersFromGroups } from '@/tune/sliderDefinitions'
import { getSyncBarState } from '@/tune/syncBarState'

type ProfileState =
  | { phase: 'loading'; error: null }
  | { phase: 'ready'; error: null }
  | { phase: 'empty'; error: null }
  | { phase: 'error'; error: string }

function groupsFromProfileFields(
  fields: Record<string, TuneProfileFieldValue> | null,
): RefloatConfigGroup[] {
  if (!fields) return []
  return APP_TUNE_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    fields: group.fields.flatMap((field) => {
      const value = fields[field.id]
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
  })).filter((group) => group.fields.length > 0)
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

export function useTuneScreenData() {
  const bleStatus = useBleStore((s) => s.status)
  const boardConnected = bleStatus === 'connected'
  const allBoards = useBoardStore((s) => s.boards)
  const selectedBoardId = useBoardStore((s) => s.activeBoardId)
  const boardsLoaded = useBoardStore((s) => s.hasLoaded)
  const loadBoards = useBoardStore((s) => s.load)
  const profiles = useTuneProfileStore((s) => s.profiles)
  const activeProfile = useTuneProfileStore((s) => s.activeProfile)
  const profileBoardId = useTuneProfileStore((s) => s.activeBoardId)
  const draftFields = useTuneProfileStore((s) => s.draftFields)
  const hasDirtyFields = useTuneProfileStore((s) => s.hasDirtyFields)
  const profileLoading = useTuneProfileStore((s) => s.loading)
  const savingProfile = useTuneProfileStore((s) => s.saving)
  const syncingProfile = useTuneProfileStore((s) => s.syncing)
  const profileError = useTuneProfileStore((s) => s.error)
  const boardDiff = useTuneProfileStore((s) => s.boardDiff)
  const hasBoardDiff = useTuneProfileStore((s) => s.hasBoardDiff)
  const loadProfiles = useTuneProfileStore((s) => s.loadProfiles)
  const setBoardSnapshot = useTuneProfileStore((s) => s.setBoardSnapshot)
  const getDirtyFields = useTuneProfileStore((s) => s.getDirtyFields)
  const clearProfiles = useTuneProfileStore((s) => s.clear)
  const boardSnapshotStatus = useTuneSnapshotStore((s) => s.status)
  const boardSnapshot = useTuneSnapshotStore((s) => s.snapshot)
  const boardSnapshotError = useTuneSnapshotStore((s) => s.error)
  const readBoardSnapshot = useTuneSnapshotStore((s) => s.read)
  const clearBoardSnapshot = useTuneSnapshotStore((s) => s.clear)

  const loadProfileConfig = useCallback(
    async (boardId: string) => {
      setBoardSnapshot(null)
      await loadProfiles(boardId).catch(() => [])
    },
    [loadProfiles, setBoardSnapshot],
  )

  const retryBoardSnapshot = useCallback(async () => {
    if (!boardConnected) return
    await readBoardSnapshot()
  }, [boardConnected, readBoardSnapshot])

  useEffect(() => {
    if (!boardsLoaded) {
      void loadBoards()
    }
  }, [boardsLoaded, loadBoards])

  useEffect(() => {
    if (selectedBoardId) {
      void loadProfileConfig(selectedBoardId)
    } else if (boardsLoaded) {
      clearProfiles()
      setBoardSnapshot(null)
    }
  }, [boardsLoaded, clearProfiles, loadProfileConfig, selectedBoardId, setBoardSnapshot])

  useEffect(() => {
    if (!boardConnected) {
      clearBoardSnapshot()
      setBoardSnapshot(null)
      return
    }
    void retryBoardSnapshot()
  }, [boardConnected, clearBoardSnapshot, retryBoardSnapshot, setBoardSnapshot])

  useEffect(() => {
    setBoardSnapshot(boardSnapshot)
  }, [boardSnapshot, setBoardSnapshot])

  const profileFields = useMemo(
    () => (activeProfile ? { ...activeProfile.fields, ...draftFields } : null),
    [activeProfile, draftFields],
  )

  const profileState = useMemo<ProfileState>(() => {
    if (!selectedBoardId) return { phase: 'loading', error: null }
    if (profileLoading && !activeProfile) return { phase: 'loading', error: null }
    if (profileError && !activeProfile) return { phase: 'error', error: profileError }
    if (profileBoardId === selectedBoardId && profiles.length === 0) {
      return { phase: 'empty', error: null }
    }
    if (activeProfile) return { phase: 'ready', error: null }
    return { phase: 'loading', error: null }
  }, [
    activeProfile,
    profileBoardId,
    profileError,
    profileLoading,
    profiles.length,
    selectedBoardId,
  ])

  const displayGroups = useMemo(() => {
    if (boardSnapshot) {
      return groupsWithProfileValues(boardSnapshot.groups, profileFields)
    }
    return groupsFromProfileFields(profileFields)
  }, [boardSnapshot, profileFields])

  const basicSliders = useMemo(() => basicSlidersFromGroups(displayGroups), [displayGroups])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dirtyFields = useMemo(() => getDirtyFields(), [getDirtyFields, draftFields, activeProfile])

  const schemaMismatchFields = useMemo(() => {
    if (!activeProfile || !boardSnapshot) return null
    const boardFieldIds = new Set(boardSnapshot.groups.flatMap((g) => g.fields.map((f) => f.id)))
    const profileFieldIds = Object.keys(activeProfile.fields)
    const profileOnly = profileFieldIds.filter((id) => !boardFieldIds.has(id))
    const boardOnly = [...boardFieldIds].filter(
      (id) => !Object.prototype.hasOwnProperty.call(activeProfile.fields, id),
    )
    if (profileOnly.length === 0 && boardOnly.length === 0) return null
    return { profileOnly, boardOnly }
  }, [activeProfile, boardSnapshot])

  const boardDiffByField = useMemo(
    () => new Map(boardDiff.map((item) => [item.fieldId, item])),
    [boardDiff],
  )

  const boardSnapshotReady = boardConnected && boardSnapshotStatus === 'ready'
  const syncBarState = useMemo(
    () =>
      getSyncBarState({
        hasProfile: activeProfile != null,
        bleStatus,
        hasDirtyFields,
        hasBoardDiff,
        dirtyCount: Object.keys(dirtyFields).length,
        diffCount: boardDiff.length,
        loadingConfig: boardConnected && boardSnapshotStatus === 'loading',
        configError: boardConnected ? boardSnapshotError : null,
        boardSnapshotReady,
        saving: savingProfile,
        syncing: syncingProfile,
      }),
    [
      activeProfile,
      bleStatus,
      boardConnected,
      boardSnapshotError,
      boardSnapshotReady,
      boardSnapshotStatus,
      hasDirtyFields,
      hasBoardDiff,
      dirtyFields,
      boardDiff,
      savingProfile,
      syncingProfile,
    ],
  )

  return {
    activeProfile,
    allBoards,
    basicSliders,
    bleStatus,
    boardConnected,
    boardDiff,
    boardDiffByField,
    boardSnapshot: boardSnapshot as RefloatConfigSnapshot | null,
    boardSnapshotError,
    boardSnapshotStatus,
    boardsLoaded,
    dirtyFields,
    displayGroups,
    draftFields,
    loadOffline: loadProfileConfig,
    loadOnline: retryBoardSnapshot,
    profileError,
    profiles,
    profileState,
    retryBoardSnapshot,
    schemaMismatchFields,
    selectedBoardId,
    syncBarState,
  }
}
