import { create } from 'zustand'
import {
  getTuneProfile as nativeGetTuneProfile,
  getTuneProfiles as nativeGetTuneProfiles,
  saveProfile as nativeSaveProfile,
  createProfile as nativeCreateProfile,
  renameProfile as nativeRenameProfile,
  deleteProfile as nativeDeleteProfile,
  getProfileHistory as nativeGetProfileHistory,
  rollbackProfile as nativeRollbackProfile,
  copyProfileToBoard as nativeCopyProfileToBoard,
  pushProfileToBoard as nativePushProfileToBoard,
  type RefloatConfigSnapshot,
  type TuneProfile,
  type TuneProfileFieldValue,
  type TuneHistoryEntry,
} from 'vesc-ble'

import { errorMessage } from '@/helpers/error'
import { useTuneSnapshotStore } from '@/store/tuneSnapshotStore'

export type { TuneProfile, TuneProfileFieldValue } from 'vesc-ble'

export interface TuneProfileBoardDiff {
  fieldId: string
  profileValue: TuneProfileFieldValue | undefined
  boardValue: TuneProfileFieldValue
}

interface TuneProfileState {
  profiles: TuneProfile[]
  activeProfile: TuneProfile | null
  activeBoardId: string | null
  draftFields: Record<string, TuneProfileFieldValue>
  hasDirtyFields: boolean
  boardFields: Record<string, TuneProfileFieldValue>
  boardDiff: TuneProfileBoardDiff[]
  hasBoardDiff: boolean
  loading: boolean
  saving: boolean
  syncing: boolean
  error: string | null
}

interface TuneProfileActions {
  loadProfiles: (boardId: string) => Promise<TuneProfile[]>
  loadProfile: (profileId: string) => Promise<TuneProfile | null>
  setActiveProfile: (profileId: string) => void
  createProfile: (name: string, cloneFromProfileId?: string) => Promise<TuneProfile | null>
  renameProfile: (profileId: string, name: string) => Promise<TuneProfile | null>
  deleteProfile: (profileId: string) => Promise<void>
  loadHistory: (profileId: string) => Promise<TuneHistoryEntry[]>
  rollbackToHistory: (historyEntryId: number) => Promise<TuneProfile | null>
  copyProfileToBoard: (
    profileId: string,
    targetBoardId: string,
    newName: string,
  ) => Promise<TuneProfile | null>
  setDraftField: (fieldId: string, value: TuneProfileFieldValue) => void
  setBoardSnapshot: (snapshot: RefloatConfigSnapshot | null) => void
  getDirtyFields: () => Record<string, TuneProfileFieldValue>
  revertField: (fieldId: string) => void
  acceptBoardField: (fieldId: string) => void
  acceptAllBoardValues: () => void
  discardAllEdits: () => void
  saveActiveProfile: () => Promise<TuneProfile | null>
  syncToBoard: () => Promise<void>
  clear: () => void
}

function sameFieldValue(
  a: TuneProfileFieldValue | undefined,
  b: TuneProfileFieldValue | undefined,
): boolean {
  return a === b || (typeof a === 'number' && typeof b === 'number' && Object.is(a, b))
}

function dirtyFields(
  profile: TuneProfile | null,
  draftFields: Record<string, TuneProfileFieldValue>,
): Record<string, TuneProfileFieldValue> {
  if (!profile) return {}
  return Object.fromEntries(
    Object.entries(draftFields).filter(
      ([fieldId, value]) => !sameFieldValue(value, profile.fields[fieldId]),
    ),
  )
}

function fieldsFromSnapshot(
  snapshot: RefloatConfigSnapshot | null,
): Record<string, TuneProfileFieldValue> {
  if (!snapshot) return {}
  return Object.fromEntries(
    snapshot.groups.flatMap((group) =>
      group.fields.map((field) => [field.id, field.value as TuneProfileFieldValue]),
    ),
  )
}

function boardDiff(
  profile: TuneProfile | null,
  boardFields: Record<string, TuneProfileFieldValue>,
): TuneProfileBoardDiff[] {
  if (!profile) return []
  return Object.entries(boardFields)
    .filter(([, boardValue]) => boardValue !== null)
    .flatMap(([fieldId, boardValue]) =>
      sameFieldValue(profile.fields[fieldId], boardValue)
        ? []
        : [{ fieldId, profileValue: profile.fields[fieldId], boardValue }],
    )
}

function nextDraftWithField(
  profile: TuneProfile,
  draftFields: Record<string, TuneProfileFieldValue>,
  fieldId: string,
  value: TuneProfileFieldValue,
): Record<string, TuneProfileFieldValue> {
  const savedValue = profile.fields[fieldId]
  const next = { ...draftFields }
  if (sameFieldValue(value, savedValue)) {
    delete next[fieldId]
  } else {
    next[fieldId] = value
  }
  return next
}

let profileLoadRequestId = 0

export const useTuneProfileStore = create<TuneProfileState & TuneProfileActions>((set, get) => ({
  profiles: [],
  activeProfile: null,
  activeBoardId: null,
  draftFields: {},
  hasDirtyFields: false,
  boardFields: {},
  boardDiff: [],
  hasBoardDiff: false,
  loading: false,
  saving: false,
  syncing: false,
  error: null,

  async loadProfiles(boardId) {
    const requestId = ++profileLoadRequestId
    const currentActive = get().activeProfile
    set({
      loading: true,
      error: null,
      activeBoardId: boardId,
    })
    try {
      const profiles = await nativeGetTuneProfiles(boardId)
      if (requestId !== profileLoadRequestId || get().activeBoardId !== boardId) {
        return get().profiles
      }
      const activeProfile =
        profiles.find((profile) => profile.id === currentActive?.id) ?? profiles[0] ?? null
      const diff = boardDiff(activeProfile, get().boardFields)
      set({
        profiles,
        activeProfile,
        draftFields: {},
        hasDirtyFields: false,
        boardDiff: diff,
        hasBoardDiff: diff.length > 0,
        loading: false,
        error: null,
      })
      return profiles
    } catch (error) {
      if (requestId !== profileLoadRequestId || get().activeBoardId !== boardId) {
        return get().profiles
      }
      set({ loading: false, error: errorMessage(error, 'Unable to load tune profiles.') })
      throw error
    }
  },

  async loadProfile(profileId) {
    set({ loading: true, error: null })
    try {
      const profile = await nativeGetTuneProfile(profileId)
      set((state) => {
        const diff = boardDiff(profile, state.boardFields)
        return {
          profiles:
            profile == null
              ? state.profiles
              : state.profiles.some((item) => item.id === profile.id)
                ? state.profiles.map((item) => (item.id === profile.id ? profile : item))
                : [...state.profiles, profile],
          activeProfile: profile,
          activeBoardId: profile?.boardId ?? state.activeBoardId,
          draftFields: {},
          hasDirtyFields: false,
          boardDiff: diff,
          hasBoardDiff: diff.length > 0,
          loading: false,
          error: null,
        }
      })
      return profile
    } catch (error) {
      set({ loading: false, error: errorMessage(error, 'Unable to load tune profiles.') })
      throw error
    }
  },

  setActiveProfile(profileId) {
    set((state) => {
      const profile = state.profiles.find((p) => p.id === profileId) ?? null
      if (!profile) return state
      const diff = boardDiff(profile, state.boardFields)
      return {
        activeProfile: profile,
        draftFields: {},
        hasDirtyFields: false,
        boardDiff: diff,
        hasBoardDiff: diff.length > 0,
      }
    })
  },

  async createProfile(name, cloneFromProfileId) {
    const state = get()
    if (!state.activeBoardId) return null
    const sourceFields = cloneFromProfileId
      ? (state.profiles.find((p) => p.id === cloneFromProfileId)?.fields ?? {})
      : {}
    try {
      const profile = await nativeCreateProfile(state.activeBoardId, name, sourceFields)
      set((prevState) => {
        const diff = boardDiff(profile, prevState.boardFields)
        return {
          profiles: [...prevState.profiles, profile],
          activeProfile: profile,
          draftFields: {},
          hasDirtyFields: false,
          boardDiff: diff,
          hasBoardDiff: diff.length > 0,
        }
      })
      return profile
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load tune profiles.') })
      return null
    }
  },

  async renameProfile(profileId, name) {
    try {
      const updated = await nativeRenameProfile(profileId, name)
      set((state) => ({
        profiles: state.profiles.map((p) => (p.id === updated.id ? updated : p)),
        activeProfile: state.activeProfile?.id === updated.id ? updated : state.activeProfile,
      }))
      return updated
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load tune profiles.') })
      return null
    }
  },

  async deleteProfile(profileId) {
    try {
      await nativeDeleteProfile(profileId)
      set((state) => {
        const remaining = state.profiles.filter((p) => p.id !== profileId)
        const needSwitch = state.activeProfile?.id === profileId
        const nextActive = needSwitch ? (remaining[0] ?? null) : state.activeProfile
        const diff = boardDiff(nextActive, state.boardFields)
        return {
          profiles: remaining,
          activeProfile: nextActive,
          draftFields: needSwitch ? {} : state.draftFields,
          hasDirtyFields: needSwitch ? false : state.hasDirtyFields,
          boardDiff: diff,
          hasBoardDiff: diff.length > 0,
        }
      })
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load tune profiles.') })
    }
  },

  async loadHistory(profileId) {
    try {
      return await nativeGetProfileHistory(profileId)
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load tune profiles.') })
      return []
    }
  },

  async rollbackToHistory(historyEntryId) {
    const profile = get().activeProfile
    if (!profile) return null
    try {
      const restored = await nativeRollbackProfile(profile.id, historyEntryId)
      set((state) => {
        const diff = boardDiff(restored, state.boardFields)
        return {
          profiles: state.profiles.map((p) => (p.id === restored.id ? restored : p)),
          activeProfile: restored,
          draftFields: {},
          hasDirtyFields: false,
          boardDiff: diff,
          hasBoardDiff: diff.length > 0,
        }
      })
      return restored
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load tune profiles.') })
      return null
    }
  },

  async copyProfileToBoard(profileId, targetBoardId, newName) {
    try {
      return await nativeCopyProfileToBoard(profileId, targetBoardId, newName)
    } catch (error) {
      set({ error: errorMessage(error, 'Unable to load tune profiles.') })
      return null
    }
  },

  setDraftField(fieldId, value) {
    set((state) => {
      if (!state.activeProfile) return state
      const savedValue = state.activeProfile.fields[fieldId]
      const draftFields = { ...state.draftFields }
      if (sameFieldValue(value, savedValue)) {
        delete draftFields[fieldId]
      } else {
        draftFields[fieldId] = value
      }
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  setBoardSnapshot(snapshot) {
    const boardFields = fieldsFromSnapshot(snapshot)
    set((state) => {
      const diff = boardDiff(state.activeProfile, boardFields)
      return {
        boardFields,
        boardDiff: diff,
        hasBoardDiff: diff.length > 0,
      }
    })
  },

  getDirtyFields() {
    const state = get()
    return dirtyFields(state.activeProfile, state.draftFields)
  },

  revertField(fieldId) {
    set((state) => {
      const draftFields = { ...state.draftFields }
      delete draftFields[fieldId]
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  acceptBoardField(fieldId) {
    set((state) => {
      if (
        !state.activeProfile ||
        !Object.prototype.hasOwnProperty.call(state.boardFields, fieldId)
      ) {
        return state
      }
      const draftFields = nextDraftWithField(
        state.activeProfile,
        state.draftFields,
        fieldId,
        state.boardFields[fieldId],
      )
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  acceptAllBoardValues() {
    set((state) => {
      const profile = state.activeProfile
      if (!profile) return state
      const draftFields = Object.entries(state.boardFields).reduce(
        (next, [fieldId, value]) => nextDraftWithField(profile, next, fieldId, value),
        { ...state.draftFields },
      )
      return {
        draftFields,
        hasDirtyFields: Object.keys(dirtyFields(state.activeProfile, draftFields)).length > 0,
      }
    })
  },

  discardAllEdits() {
    set({ draftFields: {}, hasDirtyFields: false })
  },

  async saveActiveProfile() {
    const profile = get().activeProfile
    if (!profile) return null
    const dirty = get().getDirtyFields()
    if (Object.keys(dirty).length === 0) return profile
    set({ saving: true, error: null })
    try {
      const saved = await nativeSaveProfile(profile.id, { ...profile.fields, ...dirty })
      set((state) => {
        const diff = boardDiff(saved, state.boardFields)
        return {
          profiles: state.profiles.map((item) => (item.id === saved.id ? saved : item)),
          activeProfile: saved,
          draftFields: {},
          hasDirtyFields: false,
          boardDiff: diff,
          hasBoardDiff: diff.length > 0,
          saving: false,
          error: null,
        }
      })
      return saved
    } catch (error) {
      set({ saving: false, error: errorMessage(error, 'Unable to load tune profiles.') })
      throw error
    }
  },

  async syncToBoard() {
    const profile = get().activeProfile
    if (!profile) return
    set({ syncing: true, error: null })
    try {
      const snapshot = await nativePushProfileToBoard(profile.id)
      useTuneSnapshotStore.getState().setSnapshot(snapshot)
      get().setBoardSnapshot(snapshot)
      set({ syncing: false })
    } catch (error) {
      set({ syncing: false, error: errorMessage(error, 'Unable to load tune profiles.') })
      throw error
    }
  },

  clear() {
    profileLoadRequestId += 1
    set({
      profiles: [],
      activeProfile: null,
      activeBoardId: null,
      draftFields: {},
      hasDirtyFields: false,
      boardFields: {},
      boardDiff: [],
      hasBoardDiff: false,
      loading: false,
      saving: false,
      syncing: false,
      error: null,
    })
  },
}))
