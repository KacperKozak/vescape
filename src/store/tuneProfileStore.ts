import { create } from 'zustand'
import {
  getTuneProfile as nativeGetTuneProfile,
  getTuneProfiles as nativeGetTuneProfiles,
  saveProfile as nativeSaveProfile,
  type TuneProfile,
  type TuneProfileFieldValue,
} from 'vesc-ble'

export type { TuneProfile, TuneProfileFieldValue } from 'vesc-ble'

interface TuneProfileState {
  profiles: TuneProfile[]
  activeProfile: TuneProfile | null
  activeBoardId: string | null
  draftFields: Record<string, TuneProfileFieldValue>
  hasDirtyFields: boolean
  loading: boolean
  saving: boolean
  error: string | null
}

interface TuneProfileActions {
  loadProfiles: (boardId: string) => Promise<TuneProfile[]>
  loadProfile: (profileId: string) => Promise<TuneProfile | null>
  setDraftField: (fieldId: string, value: TuneProfileFieldValue) => void
  getDirtyFields: () => Record<string, TuneProfileFieldValue>
  revertField: (fieldId: string) => void
  discardAllEdits: () => void
  saveActiveProfile: () => Promise<TuneProfile | null>
  clear: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Unable to load tune profiles.'
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

export const useTuneProfileStore = create<TuneProfileState & TuneProfileActions>((set, get) => ({
  profiles: [],
  activeProfile: null,
  activeBoardId: null,
  draftFields: {},
  hasDirtyFields: false,
  loading: false,
  saving: false,
  error: null,

  async loadProfiles(boardId) {
    set({
      profiles: [],
      activeProfile: null,
      draftFields: {},
      hasDirtyFields: false,
      loading: true,
      error: null,
      activeBoardId: boardId,
    })
    try {
      const profiles = await nativeGetTuneProfiles(boardId)
      const currentActive = get().activeProfile
      const activeProfile =
        profiles.find((profile) => profile.id === currentActive?.id) ?? profiles[0] ?? null
      set({
        profiles,
        activeProfile,
        draftFields: {},
        hasDirtyFields: false,
        loading: false,
        error: null,
      })
      return profiles
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
      throw error
    }
  },

  async loadProfile(profileId) {
    set({ loading: true, error: null })
    try {
      const profile = await nativeGetTuneProfile(profileId)
      set((state) => ({
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
        loading: false,
        error: null,
      }))
      return profile
    } catch (error) {
      set({ loading: false, error: errorMessage(error) })
      throw error
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
      set((state) => ({
        profiles: state.profiles.map((item) => (item.id === saved.id ? saved : item)),
        activeProfile: saved,
        draftFields: {},
        hasDirtyFields: false,
        saving: false,
        error: null,
      }))
      return saved
    } catch (error) {
      set({ saving: false, error: errorMessage(error) })
      throw error
    }
  },

  clear() {
    set({
      profiles: [],
      activeProfile: null,
      activeBoardId: null,
      draftFields: {},
      hasDirtyFields: false,
      loading: false,
      saving: false,
      error: null,
    })
  },
}))
