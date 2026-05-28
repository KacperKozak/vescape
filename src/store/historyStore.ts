import { create } from 'zustand'
import {
  getTelemetryHistory,
  getHistoryRange,
  getTelemetrySummary,
  clearTelemetryHistory,
  deleteTelemetryRange,
  type HistoryGpsSample,
  type HistoryMarker,
  type MetricExclusion,
  type TelemetryMinuteBucket,
  type TelemetrySample,
  type TelemetrySummary,
} from 'vesc-ble'
import { groupHistorySessions, type HistorySession } from '@/lib/history/sessions'
import { useSettingsStore } from '@/store/settingsStore'

interface HistoryState {
  blocks: TelemetryMinuteBucket[]
  sessions: HistorySession[]
  liveBlocks: TelemetryMinuteBucket[]
  selectedBlock: TelemetryMinuteBucket | null
  selectedSession: HistorySession | null
  samples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  sessionSamples: TelemetrySample[]
  sessionGpsSamples: HistoryGpsSample[]
  sessionMarkers: HistoryMarker[]
  sessionExclusions: MetricExclusion[]
  liveSamples: TelemetrySample[]
  liveGpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
  summary: TelemetrySummary | null
  loading: boolean
  loadingSamples: boolean
  loadingSession: boolean
  sessionTruncated: boolean
  error: string | undefined
  hasMore: boolean
}

interface HistoryActions {
  loadInitial: () => Promise<void>
  loadMore: () => Promise<void>
  refreshLive: () => Promise<void>
  selectBlock: (block: TelemetryMinuteBucket | null) => Promise<void>
  selectSession: (session: HistorySession | null) => Promise<void>
  refreshSummary: () => Promise<void>
  removeSelectedSession: () => Promise<void>
  clearHistory: () => Promise<void>
}

const PAGE_SIZE = 100
const MIN_SESSION_SAMPLE_LIMIT = 10_000
const PREVIEW_SAMPLE_LIMIT = 240
let liveRefreshInFlight = false
let liveRefreshVersion = 0
let sessionLoadVersion = 0

function bucketToPreviewSample(bucket: TelemetryMinuteBucket): TelemetrySample {
  return {
    id: 0,
    capturedAtMs: bucket.bucketStartMs,
    deviceId: bucket.deviceId,
    deviceName: bucket.deviceName,
    speedKmh: bucket.avgSpeedKmh,
    batteryVoltage: bucket.minBatteryVoltage ?? 0,
    motorCurrent: bucket.maxMotorCurrent,
    batteryCurrent: bucket.maxBatteryCurrent,
    dutyCycle: bucket.maxDuty,
    pitch: 0,
    roll: 0,
    balancePitch: 0,
    balanceCurrent: 0,
    erpm: 0,
    state: 0,
    switchState: 0,
    adc1: 0,
    adc2: 0,
    odometer: null,
    tempMosfet: bucket.maxTempMosfet,
    tempMotor: bucket.maxTempMotor,
    hasFault: bucket.faultCount > 0,
    faultCode: 0,
    latitude: bucket.firstLatitude,
    longitude: bucket.firstLongitude,
  }
}

function buildPreviewSamples(
  blocks: TelemetryMinuteBucket[],
  session: HistorySession,
): TelemetrySample[] {
  const blockSet = new Set(session.blockIds)
  return blocks
    .filter((b) => blockSet.has(b.id))
    .sort((a, b) => a.bucketStartMs - b.bucketStartMs)
    .map(bucketToPreviewSample)
}

function getSessionRangeOptions(session: HistorySession) {
  return {
    fromMs: session.startAtMs,
    toMs: session.endAtMs,
    ...(session.deviceId ? { deviceId: session.deviceId } : {}),
  }
}

function getSessionPreviewLimit(session: HistorySession) {
  return Math.min(PREVIEW_SAMPLE_LIMIT, Math.max(1, session.sampleCount + 1))
}

function getSessionSampleLimit(session: HistorySession) {
  return Math.max(MIN_SESSION_SAMPLE_LIMIT, session.sampleCount + 1)
}

export const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => ({
  blocks: [],
  sessions: [],
  liveBlocks: [],
  selectedBlock: null,
  selectedSession: null,
  samples: [],
  gpsSamples: [],
  sessionSamples: [],
  sessionGpsSamples: [],
  sessionMarkers: [],
  sessionExclusions: [],
  liveSamples: [],
  liveGpsSamples: [],
  markers: [],
  summary: null,
  loading: false,
  loadingSamples: false,
  loadingSession: false,
  sessionTruncated: false,
  error: undefined,
  hasMore: true,

  async loadInitial() {
    set({ loading: true, error: undefined })
    try {
      const [summary, blocks] = await Promise.all([
        getTelemetrySummary(),
        getTelemetryHistory({ limit: PAGE_SIZE }),
      ])
      set({
        summary,
        blocks,
        sessions: groupHistorySessions(blocks),
        liveBlocks: blocks.slice(0, useSettingsStore.getState().liveHistoryLimit),
        selectedBlock: null,
        selectedSession: null,
        samples: [],
        gpsSamples: [],
        sessionSamples: [],
        sessionGpsSamples: [],
        sessionMarkers: [],
        sessionExclusions: [],
        markers: [],
        sessionTruncated: false,
        hasMore: blocks.length === PAGE_SIZE,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async refreshLive() {
    if (liveRefreshInFlight) return
    liveRefreshInFlight = true
    const version = ++liveRefreshVersion
    try {
      const now = Date.now()
      const limit = useSettingsStore.getState().liveHistoryLimit
      const fromMs = now - 10 * 60_000
      const [summary, liveBlocks, range] = await Promise.all([
        getTelemetrySummary(),
        getTelemetryHistory({ fromMs, toMs: now, limit }),
        getHistoryRange({ fromMs, toMs: now, limit: 120 }),
      ])
      if (version !== liveRefreshVersion) return
      set((state) => {
        const known = new Map(state.blocks.map((b) => [b.id, b]))
        for (const block of liveBlocks) {
          known.set(block.id, block)
        }
        const blocks = Array.from(known.values()).sort((a, b) => b.bucketStartMs - a.bucketStartMs)
        return {
          summary,
          liveBlocks,
          liveSamples: range.boardSamples,
          liveGpsSamples: range.gpsSamples,
          blocks,
          sessions: groupHistorySessions(blocks),
        }
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      liveRefreshInFlight = false
    }
  },

  async loadMore() {
    const { blocks, hasMore, loading } = get()
    if (loading || !hasMore || blocks.length === 0) return
    set({ loading: true, error: undefined })
    try {
      const cursorBeforeMs = Math.min(...blocks.map((b) => b.bucketStartMs)) - 1
      const next = await getTelemetryHistory({ limit: PAGE_SIZE, cursorBeforeMs })
      const ids = new Set(blocks.map((b) => b.id))
      const merged = [...blocks, ...next.filter((b) => !ids.has(b.id))]
      const sessions = groupHistorySessions(merged)
      const selectedSession = get().selectedSession
      const nextSelectedSession = selectedSession
        ? sessions.find(
            (session) =>
              session.id === selectedSession.id ||
              (session.deviceId === selectedSession.deviceId &&
                session.startAtMs <= selectedSession.endAtMs &&
                session.endAtMs >= selectedSession.startAtMs),
          )
        : null
      set({
        blocks: merged,
        sessions,
        selectedSession: nextSelectedSession ?? selectedSession,
        hasMore: next.length === PAGE_SIZE,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },

  async selectBlock(block) {
    if (!block) {
      set({ selectedBlock: null, samples: [], gpsSamples: [], markers: [], loadingSamples: false })
      return
    }
    set({
      selectedBlock: block,
      samples: [],
      gpsSamples: [],
      markers: [],
      loadingSamples: true,
      error: undefined,
    })
    try {
      const range = await getHistoryRange({
        fromMs: block.startAtMs,
        toMs: block.endAtMs,
        ...(block.deviceId ? { deviceId: block.deviceId } : {}),
        limit: 500,
      })
      set({ samples: range.boardSamples, gpsSamples: range.gpsSamples, markers: range.markers })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loadingSamples: false })
    }
  },

  async selectSession(session) {
    const version = ++sessionLoadVersion
    if (!session) {
      set({
        selectedSession: null,
        sessionSamples: [],
        sessionGpsSamples: [],
        sessionMarkers: [],
        sessionExclusions: [],
        loadingSession: false,
        sessionTruncated: false,
      })
      return
    }
    const previewSamples = buildPreviewSamples(get().blocks, session)
    set({
      selectedSession: session,
      sessionSamples: previewSamples.length > 0 ? previewSamples : get().sessionSamples,
      sessionGpsSamples: [],
      loadingSession: true,
      sessionTruncated: false,
      error: undefined,
    })
    try {
      const rangeOptions = getSessionRangeOptions(session)
      if (session.centerLatitude == null || session.centerLongitude == null) {
        void getHistoryRange({
          ...rangeOptions,
          limit: getSessionPreviewLimit(session),
        }).then((previewRange) => {
          if (version !== sessionLoadVersion || previewRange.gpsSamples.length === 0) return
          if (get().sessionGpsSamples.length > 0) return
          set({ sessionGpsSamples: previewRange.gpsSamples })
        })
      }
      const range = await getHistoryRange({
        ...rangeOptions,
        limit: getSessionSampleLimit(session),
      })
      if (version !== sessionLoadVersion) return
      set({
        sessionSamples: range.boardSamples,
        sessionGpsSamples: range.gpsSamples,
        sessionMarkers: range.markers,
        sessionExclusions: range.exclusions,
        sessionTruncated:
          range.boardSamples.length < session.sampleCount ||
          range.gpsSamples.length < session.gpsPointCount,
      })
    } catch (err) {
      if (version === sessionLoadVersion) {
        set({ error: err instanceof Error ? err.message : String(err) })
      }
    } finally {
      if (version === sessionLoadVersion) {
        set({ loadingSession: false })
      }
    }
  },

  async refreshSummary() {
    try {
      const summary = await getTelemetrySummary()
      set({ summary })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  async removeSelectedSession() {
    const { selectedSession, sessions } = get()
    if (!selectedSession) return
    liveRefreshVersion++
    set({ loadingSession: true, error: undefined })
    try {
      await deleteTelemetryRange({
        fromMs: selectedSession.startAtMs,
        toMs: selectedSession.endAtMs,
        deviceId: selectedSession.deviceId,
      })
      const selectedIndex = sessions.findIndex((session) => session.id === selectedSession.id)
      const selectedBlockIds = new Set(selectedSession.blockIds)
      const blocks = get().blocks.filter((block) => !selectedBlockIds.has(block.id))
      const liveBlocks = get().liveBlocks.filter((block) => !selectedBlockIds.has(block.id))
      const nextSessions = groupHistorySessions(blocks)
      const nextSelectedSession =
        selectedIndex >= 0
          ? (nextSessions[selectedIndex] ?? nextSessions[selectedIndex - 1] ?? null)
          : null
      const summary = await getTelemetrySummary()
      set({
        summary,
        blocks,
        liveBlocks,
        sessions: nextSessions,
        selectedBlock: null,
        selectedSession: nextSelectedSession,
        samples: [],
        gpsSamples: [],
        sessionSamples: [],
        sessionGpsSamples: [],
        sessionMarkers: [],
        sessionExclusions: [],
        markers: [],
        sessionTruncated: false,
      })
      if (nextSelectedSession) {
        await get().selectSession(nextSelectedSession)
      }
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loadingSession: false })
    }
  },

  async clearHistory() {
    set({ loading: true, error: undefined })
    try {
      await clearTelemetryHistory()
      set({
        blocks: [],
        sessions: [],
        liveBlocks: [],
        selectedBlock: null,
        selectedSession: null,
        samples: [],
        gpsSamples: [],
        sessionSamples: [],
        sessionGpsSamples: [],
        sessionMarkers: [],
        sessionExclusions: [],
        liveSamples: [],
        liveGpsSamples: [],
        markers: [],
        sessionTruncated: false,
        summary: await getTelemetrySummary(),
        hasMore: false,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ loading: false })
    }
  },
}))

export type { HistoryGpsSample, HistoryMarker, HistorySession, TelemetrySample }
