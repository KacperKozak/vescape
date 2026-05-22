import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getRefloatConfigSnapshot,
  type RefloatConfigGroup,
  type RefloatConfigSnapshot,
  type TuneProfile,
  type TuneProfileFieldValue,
} from 'vesc-ble'

import { useBoardStore } from '@/store/boardStore'
import { useBleStore } from '@/store/bleStore'
import { useTuneProfileStore } from '@/store/tuneProfileStore'
import { APP_TUNE_FIELD_BY_ID, APP_TUNE_GROUPS } from '@/tune/fields'
import { basicSlidersFromSnapshot } from '@/tune/sliderDefinitions'
import { getSyncBarState } from '@/tune/syncBarState'

type LoadState =
  | { phase: 'loading'; snapshot: RefloatConfigSnapshot | null; error: string | null }
  | { phase: 'ready'; snapshot: RefloatConfigSnapshot; error: null }
  | { phase: 'empty'; snapshot: null; error: null }
  | { phase: 'error'; snapshot: RefloatConfigSnapshot | null; error: string }

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

export function useTuneScreenData() {
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
  const setBoardSnapshot = useTuneProfileStore((s) => s.setBoardSnapshot)
  const getDirtyFields = useTuneProfileStore((s) => s.getDirtyFields)
  const clearProfiles = useTuneProfileStore((s) => s.clear)

  const loadRequestId = useRef(0)
  const [state, setState] = useState<LoadState>({
    phase: 'loading',
    snapshot: null,
    error: null,
  })

  const loadOnline = useCallback(async () => {
    const requestId = ++loadRequestId.current
    setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
    try {
      const snapshot = await getRefloatConfigSnapshot()
      if (requestId !== loadRequestId.current) return

      if (snapshot.boardId) {
        await loadProfiles(snapshot.boardId).catch(() => [])
      } else {
        clearProfiles()
      }
      if (requestId !== loadRequestId.current) return

      setBoardSnapshot(snapshot)
      setState({ phase: 'ready', snapshot, error: null })
    } catch (error) {
      if (requestId !== loadRequestId.current) return
      setState((current) => ({
        phase: 'error',
        snapshot: current.snapshot,
        error: errorMessage(error),
      }))
    }
  }, [clearProfiles, loadProfiles, setBoardSnapshot])

  const loadOffline = useCallback(
    async (boardId: string) => {
      const requestId = ++loadRequestId.current
      setState((current) => ({ phase: 'loading', snapshot: current.snapshot, error: null }))
      try {
        const profileList = await loadProfiles(boardId)
        if (requestId !== loadRequestId.current) return

        const profile = profileList[0]
        if (!profile) {
          setBoardSnapshot(null)
          setState({ phase: 'empty', snapshot: null, error: null })
          return
        }
        const snapshot = snapshotFromTuneProfile(boardId, profile)
        setBoardSnapshot(null)
        setState({ phase: 'ready', snapshot, error: null })
      } catch (error) {
        if (requestId !== loadRequestId.current) return
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
      loadRequestId.current += 1
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

  const snapshot = state.snapshot
  const loadingBoardConfig = boardConnected && state.phase === 'loading'
  const fallbackSnapshot = useMemo(() => {
    if (!loadingBoardConfig || snapshot || !selectedBoardId || !activeProfile) return null
    return snapshotFromTuneProfile(selectedBoardId, activeProfile)
  }, [activeProfile, loadingBoardConfig, selectedBoardId, snapshot])
  const visibleSnapshot = snapshot ?? fallbackSnapshot
  const profileFields = useMemo(
    () => (activeProfile ? { ...activeProfile.fields, ...draftFields } : null),
    [activeProfile, draftFields],
  )
  const displayGroups = useMemo(
    () => (visibleSnapshot ? groupsWithProfileValues(visibleSnapshot.groups, profileFields) : []),
    [profileFields, visibleSnapshot],
  )
  const displaySnapshot = useMemo(
    () => (visibleSnapshot ? { ...visibleSnapshot, groups: displayGroups } : null),
    [displayGroups, visibleSnapshot],
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
        loadingConfig: loadingBoardConfig,
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
      loadingBoardConfig,
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
    boardsLoaded,
    dirtyFields,
    displayGroups,
    displaySnapshot,
    draftFields,
    loadOffline,
    loadOnline,
    loadingBoardConfig,
    profileError,
    profiles,
    schemaMismatchFields,
    selectedBoardId,
    state,
    syncBarState,
    visibleSnapshot,
  }
}
