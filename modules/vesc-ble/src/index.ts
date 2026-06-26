import { requireNativeModule, type EventSubscription } from 'expo-modules-core'

import { e2eFake } from './e2eFake'

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface DeviceFoundEvent {
  id: string
  name: string
  rssi: number
  serviceUUIDs: string[]
}

export interface ErrorEvent {
  message: string
}

export interface LocationEvent {
  latitude: number
  longitude: number
  speedMps: number | null
  bearingDeg: number | null
  accuracyM: number | null
  altitudeM: number | null
  timestamp: number
  precise: boolean
}

export type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'discovering'
  | 'subscribing'
  | 'waiting_for_telemetry'
  | 'connected'
  | 'stale'
  | 'reconnecting'
  | 'rescanning'
  | 'disconnecting'
  | 'error'
export type BoardStatus = SessionStatus
export type GpsStatus = 'idle' | 'active'
export type ScanStatus = 'idle' | 'scanning' | 'error'

export interface FiredAlert {
  ruleId: string
  controlId: string
  value: number
  threshold: number
  thresholdMax: number | null
  soundType: string
  firedAt: number
}

/**
 * How a Board is reached. `null` = undetected (no persisted "unknown" state),
 * `'direct'` = direct connection, a number = CAN-forwarded to that CAN id.
 */
export type BoardTransport = 'direct' | number

export type BoardProbeOutcome = 'resolved' | 'needs-pick' | 'none'

/** A probe-confirmed transport plus the capabilities discovered while probing it. */
export interface BoardCandidate {
  transport: BoardTransport
  /** Whether a smart-BMS answered on this transport during the probe. */
  hasBms: boolean
}

/** Result of a native Board Probe of a BLE peripheral. */
export interface BoardProbeResult {
  outcome: BoardProbeOutcome
  /** Every transport that produced a valid Telemetry Sample, in probe order. */
  candidates: BoardCandidate[]
}

/**
 * Coarse, monotonic probe phase surfaced live so UI can show progress. These are
 * the rider-facing phases, not the probe loop's per-transport internals: a probe
 * connects, handshakes the VESC service, then probes transports until one returns
 * telemetry. The resolved transport(s) and smart-BMS capability are read from the
 * returned {@link BoardCandidate}s, not from progress events. Detailed
 * per-transport milestones stay in Diagnostic Events for debugging.
 */
export type BoardProbeStep = 'connecting' | 'handshake' | 'probing' | 'completed' | 'failed'

export interface BoardProbeProgressEvent {
  step: BoardProbeStep
  /** Milliseconds elapsed since the probe started. */
  elapsedMs: number
}

/**
 * Durable, probe-confirmed reachability for a Board. Saved whole or not at all:
 * a Board Link always carries a proven BLE peripheral id and Board Transport.
 */
export interface BoardLink {
  bleId: string
  transport: BoardTransport
  /**
   * Probe-confirmed smart-BMS presence on {@link transport}. `undefined` on links
   * saved before BMS detection existed — treated as unknown (still polled).
   */
  hasBms?: boolean
}

export interface Board {
  id: string
  name: string
  description: string | null
  createdAt: number
  batteryConfig: BatteryConfig | null
  /** Probe-confirmed reachability. `null` means offline-only/unlinked. */
  link: BoardLink | null
}

export type BatteryConfig = BatteryPresetConfig | BatteryManualConfig

export interface BatteryPresetConfig {
  mode: 'preset'
  cellPresetId: string
  seriesCount: number
  parallelCount: number
}

export interface BatteryManualConfig {
  mode: 'manual'
  minVoltage: number
  maxVoltage: number
}

export type AlertSoundType = string

export type AlertPresetCategory = 'single' | 'geiger'

export interface AlertPreset {
  name: string
  uri: string
  category: AlertPresetCategory
}

export interface AlertRule {
  id: string
  controlId: string
  threshold: number
  thresholdMax: number | null
  enabled: boolean
  soundType: AlertSoundType
  createdAt: number
}

export type PrivacyZonePreset = 'home' | 'work' | 'custom'

export interface PrivacyZone {
  id: string
  preset: PrivacyZonePreset
  name: string
  enabled: boolean
  centerLatitude: number
  centerLongitude: number
  radiusMeters: number
  createdAt: number
  updatedAt: number
}

export type MapPointKind =
  | 'direction'
  | 'drop'
  | 'bonk'
  | 'nose_slide'
  | 'trail_entry'
  | 'viewpoint'
  | 'charging'
  | 'charging_food'

export interface MapPoint {
  id: string
  kind: MapPointKind
  latitude: number
  longitude: number
  createdAt: number
  updatedAt: number
}

export interface TelemetryEvent {
  generation?: number
  /** Native remote-tilt snapshot paired with this telemetry tick. */
  remoteTilt?: RemoteTiltState | null
  location?: LocationEvent | null
  metricExclusions?: Record<string, boolean>
  metricExclusionUpdates?: LiveMetricExclusionUpdate[]
  hasFault: boolean
  faultCode: number
  pitch: number
  roll: number
  balancePitch: number
  balanceCurrent: number
  speed: number
  batteryVoltage: number
  batteryPercent: number | null
  motorCurrent: number
  batteryCurrent: number
  erpm: number
  dutyCycle: number
  state: number
  stateName: string
  switchState: number
  adc1: number
  adc2: number
  odometer: number | null
  tempMosfet: number | null
  tempMotor: number | null
  avgLatency: number | null
  lastPacketAt: number
  firedAlerts?: FiredAlert[]
}

/** Smart-BMS snapshot decoded from a VESC `COMM_BMS_GET_VALUES` reply. */
export interface BmsEvent {
  capturedAt: number
  /** Pack voltage as reported by the BMS (sum of cell groups). */
  voltageTotal: number
  current: number
  ampHours: number
  wattHours: number
  /** State of charge 0–1, or null when the firmware variant omits it. */
  soc: number | null
  /** Per cell-group voltage, index 0 = first group. */
  cellVoltages: number[]
  /** Per cell-group balancing flag, aligned with cellVoltages. */
  balancing: boolean[]
}

export interface LiveMetricExclusionUpdate {
  lastPacketAt: number
  metricExclusions: Record<string, boolean>
}

export type BoardPhase = SessionStatus
export type GpsPhase = 'idle' | 'starting' | 'active' | 'error'
export type ScanPhase = ScanStatus
export type RemoteTiltPhase = 'idle' | 'holding' | 'decaying' | 'locked'

export interface RemoteTiltDecay {
  elapsedMs: number
  totalMs: number
}

/** Native-owned active remote-tilt command. `null` represents idle. */
export interface RemoteTiltState {
  value: number
  phase: Exclude<RemoteTiltPhase, 'idle'>
  /** Present only while native is executing a release decay. */
  decay?: RemoteTiltDecay
}

export interface LiveStateEvent {
  board: {
    phase: BoardPhase
    selectedBoardId: string | null
    connectedBoardId: string | null
    bleId: string | null
    name: string | null
    connectionSeq: number
    lastTelemetryAt: number | null
    recentTelemetry: TelemetryEvent[]
    error: string | null
    autoConnect: boolean
    /** Native-owned active remote-tilt command, or `null` when idle. */
    remoteTilt: RemoteTiltState | null
  }
  gps: {
    phase: GpsPhase
    latestFix: LocationEvent | null
    latestApproximateFix?: LocationEvent | null
    latestPreciseFix?: LocationEvent | null
    recentLocations: LocationEvent[]
    error: string | null
  }
  scan: {
    phase: ScanPhase
    devices: DeviceFoundEvent[]
    error: string | null
  }
  recording: {
    enabled: boolean
    activeBoardId: string | null
    startedAt: number | null
  }
}

export interface TelemetryHistoryOptions {
  fromMs?: number
  toMs?: number
  deviceId?: string
  limit?: number
  cursorBeforeMs?: number
}

export interface DiagnosticEventOptions {
  fromMs?: number
  toMs?: number
  deviceId?: string
  limit?: number
}

export interface TelemetryDeleteRangeOptions {
  fromMs: number
  toMs: number
  deviceId?: string | null
}

export interface TelemetryMinuteBucket {
  id: string
  startAtMs: number
  endAtMs: number
  bucketStartMs: number
  deviceId: string | null
  deviceName: string
  sampleCount: number
  gpsPointCount: number
  preciseGpsPointCount: number
  maxAbsSpeedKmh: number
  maxGpsSpeedKmh: number | null
  avgSpeedKmh: number
  avgSpeedSampleCount: number
  minBatteryVoltage: number | null
  maxMotorCurrent: number
  maxBatteryCurrent: number
  maxDuty: number
  faultCount: number
  distanceDeltaM: number | null
  gpsDistanceM: number | null
  maxTempMosfet: number | null
  maxTempMotor: number | null
  batteryUsedWh: number
  batteryRegenWh: number
  firstLatitude: number | null
  firstLongitude: number | null
  firstMovingAtMs: number | null
  lastMovingAtMs: number | null
  boundaryBefore:
    | 'none'
    | 'connected'
    | 'disconnected'
    | 'connection_lost'
    | 'error'
    | 'gap'
    | 'app_stop'
  boundaryMessage?: string | null
  gapBeforeMs?: number | null
}

export interface TelemetrySample {
  id: number
  capturedAtMs: number
  deviceId: string | null
  deviceName: string
  speedKmh: number
  batteryVoltage: number
  /** IR-compensated battery %, derived on read from the board's battery config. Null if no config. */
  batteryPercent: number | null
  motorCurrent: number
  batteryCurrent: number
  dutyCycle: number
  pitch: number
  roll: number
  balancePitch: number
  balanceCurrent: number
  erpm: number
  state: number
  switchState: number
  adc1: number
  adc2: number
  odometer: number | null
  tempMosfet: number | null
  tempMotor: number | null
  hasFault: boolean
  faultCode: number
  latitude: number | null
  longitude: number | null
}

export interface HistoryGpsSample {
  id: number
  capturedAtMs: number
  deviceId: string | null
  deviceName: string
  latitude: number
  longitude: number
  speedMps: number | null
  bearingDeg: number | null
  accuracyM: number | null
  altitudeM: number | null
  timestamp: number
  precise: boolean
  distanceFromPreviousM: number | null
}

export interface HistoryMarker {
  id: number
  occurredAtMs: number
  type: 'connected' | 'disconnected' | 'connection_lost' | 'error' | 'gap' | 'app_stop'
  deviceId: string | null
  deviceName: string | null
  message: string | null
  gapMs: number | null
}

export interface MetricExclusion {
  id: number
  deviceId: string | null
  reason: string
  startMs: number
  endMs: number
  sampleCount: number
  metrics: Record<string, boolean>
}

export interface HistoryRange {
  boardSamples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
  exclusions: MetricExclusion[]
}

/** Float64 lanes per sample in the columnar board payload. Must match the native encoder. */
const SAMPLE_COLUMN_COUNT = 25

/**
 * Native `getHistoryRange` shape: board samples arrive as one columnar Float64 ArrayBuffer (25
 * lanes/sample, row-major) plus a device dictionary, instead of an array of ~25-field objects. This
 * replaces N×25 per-field JSI conversions with a single buffer transfer; see decodeBoardSamples.
 */
interface NativeHistoryRange {
  boardColumns: ArrayBuffer
  boardCount: number
  boardDevices: (string | null)[]
  boardDeviceNames: string[]
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
  exclusions: MetricExclusion[]
}

const nullableLane = (value: number): number | null => (Number.isNaN(value) ? null : value)

/** Rebuild TelemetrySample objects from the columnar buffer locally (no per-field bridge crossing). */
function decodeBoardSamples(range: NativeHistoryRange): TelemetrySample[] {
  const { boardCount, boardDevices, boardDeviceNames } = range
  if (!boardCount || !range.boardColumns) return []
  const lanes = new Float64Array(range.boardColumns)
  const samples = new Array<TelemetrySample>(boardCount)
  for (let i = 0; i < boardCount; i++) {
    const o = i * SAMPLE_COLUMN_COUNT
    const deviceIndex = lanes[o + 2]
    samples[i] = {
      id: lanes[o],
      capturedAtMs: lanes[o + 1],
      deviceId: boardDevices[deviceIndex] ?? null,
      deviceName: boardDeviceNames[deviceIndex],
      speedKmh: lanes[o + 3],
      batteryVoltage: lanes[o + 4],
      batteryPercent: nullableLane(lanes[o + 5]),
      motorCurrent: lanes[o + 6],
      batteryCurrent: lanes[o + 7],
      dutyCycle: lanes[o + 8],
      pitch: lanes[o + 9],
      roll: lanes[o + 10],
      balancePitch: lanes[o + 11],
      balanceCurrent: lanes[o + 12],
      erpm: lanes[o + 13],
      state: lanes[o + 14],
      switchState: lanes[o + 15],
      adc1: lanes[o + 16],
      adc2: lanes[o + 17],
      odometer: nullableLane(lanes[o + 18]),
      tempMosfet: nullableLane(lanes[o + 19]),
      tempMotor: nullableLane(lanes[o + 20]),
      hasFault: lanes[o + 21] !== 0,
      faultCode: lanes[o + 22],
      latitude: nullableLane(lanes[o + 23]),
      longitude: nullableLane(lanes[o + 24]),
    }
  }
  return samples
}

export interface TelemetrySummary {
  sampleCount: number
  gpsPointCount: number
  firstAtMs: number | null
  lastAtMs: number | null
  droppedPendingSamples: number
}

export interface RefloatConfigField {
  id: string
  label: string
  value: number | boolean | string
  unit: string | null
  min: number | null
  max: number | null
}

export interface RefloatConfigGroup {
  id: string
  title: string
  fields: RefloatConfigField[]
}

export interface RefloatConfigSnapshot {
  capturedAt: number
  boardId: string | null
  canId: number
  schemaHash: string
  rawConfigHash: string
  rawConfigLength: number
  groups: RefloatConfigGroup[]
  missingFieldIds: string[]
  fwVersion: string | null
}

export type TuneProfileFieldValue = number | boolean | string | null

export interface TuneProfile {
  id: string
  boardId: string
  name: string
  fields: Record<string, TuneProfileFieldValue>
  createdAt: number
  updatedAt: number
}

export interface TuneHistoryEntry {
  id: number
  profileId: string
  fields: Record<string, TuneProfileFieldValue>
  createdAt: number
}

export interface ProfileStats {
  distanceM: number | null
  rideCount: number
  rideTimeMs: number
  topSpeedKmh: number
  avgSpeedKmh: number
  longestRideM: number | null
  batteryUsedWh: number | null
  batteryRegenWh: number | null
}

export interface ProfileStatsMonth {
  year: number
  month: number
}

export interface AppSettings {
  liveHistoryLimit: number
  autoConnect: boolean
  autoRecording: boolean
  selectedBoardId: string | null
  lastGpsLatitude: number | null
  lastGpsLongitude: number | null
  movingSpeedThresholdKmh: number
  freeSpinMaxSpeedDeltaKmh: number
  freeSpinStationaryBoardCapKmh: number
  mapStyleKey: 'onedark' | 'outdoors' | 'satellite' | 'mapy'
  mapNavigationMode: 'northUp' | 'gpsHeading' | 'phoneHeading' | 'freeRotate'
  historyMetricGradientsEnabled: boolean
  historyMetricHotRanges: Partial<
    Record<
      | 'speed'
      | 'duty'
      | 'battery'
      | 'tempMotor'
      | 'tempController'
      | 'motorCurrent'
      | 'batteryCurrent',
      { start: number; end: number }
    >
  >
  /** Battery SoC Estimate median window, seconds. 0 = off. See ADR-0016. */
  socEstimateWindowSeconds: number
  /** Play on/off sounds on board connect and involuntary disconnect. */
  connectionSoundsEnabled: boolean
  /** Android-only: use CompanionDeviceManager presence to connect selected board when nearby. */
  companionPresenceEnabled: boolean
  /**
   * Max telemetry poll rate in Hz, applied as a minimum spacing floor between
   * requests. Polling stays response-paced (the next request is only sent once
   * the previous reply lands), so this caps the rate without ever outrunning the
   * controller. 0 = unlimited (pure response-paced, the original behaviour).
   */
  telemetryPollRateHz: number
  /**
   * Watch Mirror push interval in ms — the cadence of the dedicated watch tick,
   * independent of the board poll rate. Lower values increase wrist update rate
   * for stress-testing the link. Floored at 50ms (20Hz), capped at 10s.
   */
  wearMirrorIntervalMs: number
}

export interface DiagnosticStatus {
  enabled: boolean
  host: string
  distinctId: string | null
  captureCount: number
  lastEventName: string | null
  lastCaptureAt: number | null
}

export interface LocalDiagnosticEvent {
  id: number
  occurredAtMs: number
  eventName: string
  operation: string | null
  phase: string | null
  deviceId: string | null
  deviceName: string | null
  message: string | null
  propertiesJson: string
}

export interface TelemetryRebuildProgressEvent {
  current: number
  total: number
}

export interface DatabaseBackupResult {
  uri: string
  name: string
  sizeBytes: number
}

/** Raw BLE debug capture stored by the Android native module. */
export interface DebugRecording {
  name: string
  createdAt: number
  sizeBytes: number
}

// ---------------------------------------------------------------------------
// Typed emitter
// ---------------------------------------------------------------------------

/** Batched history payload: full samples flushed by native a few times per second. */
export interface TelemetryHistoryEvent {
  samples: TelemetryEvent[]
}

/**
 * Decimated live sparkline series, computed natively from the in-memory window.
 * Each metric is a flat `[ts0, v0, ts1, v1, ...]` array (min/max per time bucket),
 * so the strip (and, while the perf flag is on, the `/control` detail charts) render
 * without streaming raw samples across the bridge.
 */
export interface LiveSeriesEvent {
  metrics: Record<string, number[]>
  generation: number
}

type VescBleEvents = {
  onDevice: (event: DeviceFoundEvent) => void
  onError: (event: ErrorEvent) => void
  onLiveState: (event: LiveStateEvent) => void
  /** High-frequency (per-frame) scalar tick for live gauges. No history, no nested arrays. */
  onLiveTick: (event: TelemetryEvent) => void
  /** Decimated per-metric min/max sparkline series (~1Hz) for the live strip + detail charts. */
  onLiveSeries: (event: LiveSeriesEvent) => void
  /** Batched full samples (~3Hz) for history buffer and detail charts. */
  onTelemetryHistory: (event: TelemetryHistoryEvent) => void
  onBms: (event: BmsEvent) => void
  onLocation: (event: LocationEvent) => void
  onTelemetryRebuildProgress: (event: TelemetryRebuildProgressEvent) => void
  onBoardProbeProgress: (event: BoardProbeProgressEvent) => void
}

interface NativeEventEmitter<TEvents extends Record<string, (...args: never[]) => void>> {
  addListener<EventName extends keyof TEvents>(
    eventName: EventName,
    listener: TEvents[EventName],
  ): EventSubscription
  removeListener<EventName extends keyof TEvents>(
    eventName: EventName,
    listener: TEvents[EventName],
  ): void
  removeAllListeners(eventName: keyof TEvents): void
}

type VescBleNativeModule = NativeEventEmitter<VescBleEvents> & {
  scan(): void
  stopScan(): void
  exitApp(): void
  startLocationUpdates(): void
  stopLocationUpdates(): void
  setTelemetryRecordingEnabled(enabled: boolean): void
  reloadAlertRules(): void
  getAlertPresets(): AlertPreset[]
  previewAlertSound(soundType: AlertSoundType): void
  startGeigerSimulation(soundType: string, rangeDepth: number): void
  stopGeigerSimulation(): void
  selectBoard(boardId: string): Promise<void>
  stopBoard(): Promise<void>
  probeBoardLink(bleId: string): Promise<BoardProbeResult>
  setDebugRecordingEnabled(enabled: boolean): void
  listDebugRecordings(): Promise<DebugRecording[]>
  exportDebugRecording(name: string): Promise<DatabaseBackupResult>
  reportUiError(message: string, source?: string | null, stack?: string | null): void
  reportDiagnosticTest(): DiagnosticStatus
  getDiagnosticStatus(): DiagnosticStatus
  getLiveState(): LiveStateEvent
  getRemoteTiltState(): RemoteTiltState | null
  setSelectedBoard(boardId: string | null): void
  setCompanionPresenceEnabled(enabled: boolean): Promise<void>
  getTelemetryHistory(options: TelemetryHistoryOptions): Promise<TelemetryMinuteBucket[]>
  getTelemetrySamples(options: {
    fromMs: number
    toMs: number
    deviceId?: string
    limit?: number
  }): Promise<TelemetrySample[]>
  getHistoryRange(options: {
    fromMs: number
    toMs: number
    deviceId?: string
    limit?: number
  }): Promise<NativeHistoryRange>
  getTelemetrySummary(): Promise<TelemetrySummary>
  getDiagnosticEvents(options: DiagnosticEventOptions): Promise<LocalDiagnosticEvent[]>
  clearDiagnosticEvents(): Promise<void>
  getDatabaseSizeBytes(): Promise<number>
  backupDatabase(): Promise<DatabaseBackupResult>
  restoreDatabase(uri: string): Promise<void>
  getRefloatConfigSnapshot(): Promise<RefloatConfigSnapshot>
  setRemoteTilt(value: number): Promise<boolean>
  lockRemoteTilt(value: number): Promise<boolean>
  releaseRemoteTilt(value: number, durationMs: number): Promise<boolean>
  stopRemoteTilt(): Promise<boolean>
  getTuneProfiles(boardId: string): Promise<TuneProfile[]>
  getTuneProfile(profileId: string): Promise<TuneProfile | null>
  createProfile(
    boardId: string,
    name: string,
    fields: Record<string, TuneProfileFieldValue>,
  ): Promise<TuneProfile>
  renameProfile(profileId: string, name: string): Promise<TuneProfile>
  deleteProfile(profileId: string): Promise<void>
  getProfileHistory(profileId: string): Promise<TuneHistoryEntry[]>
  rollbackProfile(profileId: string, historyEntryId: number): Promise<TuneProfile>
  copyProfileToBoard(
    profileId: string,
    targetBoardId: string,
    newName: string,
  ): Promise<TuneProfile>
  saveProfile(
    profileId: string,
    fields: Record<string, TuneProfileFieldValue>,
  ): Promise<TuneProfile>
  pushProfileToBoard(profileId: string): Promise<RefloatConfigSnapshot>
  getTotalProfileStats(): Promise<ProfileStats>
  getMonthlyProfileStats(options: ProfileStatsMonth): Promise<ProfileStats>
  getProfileStatMonths(): Promise<ProfileStatsMonth[]>
  rebuildTelemetryBuckets(): Promise<number>
  deleteTelemetryBefore(beforeMs: number): Promise<number>
  deleteTelemetryRange(options: TelemetryDeleteRangeOptions): Promise<number>
  clearTelemetryHistory(): Promise<void>
  getBoards(): Promise<Board[]>
  upsertBoard(board: Board): Promise<void>
  deleteBoard(id: string): Promise<void>
  getAlertRules(): Promise<AlertRule[]>
  upsertAlertRule(rule: AlertRule): Promise<void>
  setAlertRuleEnabled(id: string, enabled: boolean): Promise<void>
  deleteAlertRule(id: string): Promise<void>
  getPrivacyZones(): Promise<PrivacyZone[]>
  upsertPrivacyZone(zone: PrivacyZone): Promise<void>
  setPrivacyZoneEnabled(id: string, enabled: boolean): Promise<void>
  deletePrivacyZone(id: string): Promise<void>
  getMapPoints(): Promise<MapPoint[]>
  upsertMapPoint(point: MapPoint): Promise<void>
  replaceDirectionMapPoint(point: MapPoint): Promise<void>
  deleteMapPoint(id: string): Promise<void>
  getSettings(): Promise<AppSettings>
  updateSetting(
    key: string,
    value: number | boolean | string | Record<string, unknown> | null,
  ): Promise<void>
}

const native = requireNativeModule<VescBleNativeModule>('VescBle')
const emitter = native
const E2E_ENABLED = process.env.EXPO_PUBLIC_E2E === '1'

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Start BLE scan — emits onDevice events for every advertisement received. */
export function scan(): void {
  if (E2E_ENABLED) {
    e2eFake.scan()
    return
  }

  native.scan()
}

/** Stop ongoing BLE scan. */
export function stopScan(): void {
  if (E2E_ENABLED) {
    e2eFake.stopScan()
    return
  }

  native.stopScan()
}

/** Start app-level Android location updates independently of a board session. */
export function startLocationUpdates(): void {
  native.startLocationUpdates()
}

/** Stop app-level Android location updates. Board sessions manage their own recording location. */
export function stopLocationUpdates(): void {
  native.stopLocationUpdates()
}

/** Enable or disable native SQLite telemetry history writes. */
export function setTelemetryRecordingEnabled(enabled: boolean): void {
  native.setTelemetryRecordingEnabled(enabled)
}

/** Tell the Android foreground service to re-read alert rules from native storage. */
export function reloadAlertRules(): void {
  native.reloadAlertRules()
}

const FALLBACK_PRESETS: AlertPreset[] = [
  { name: 'Beep', uri: 'preset:beep', category: 'single' },
  { name: 'Urgent', uri: 'preset:urgent', category: 'single' },
  { name: 'Notify', uri: 'preset:notify', category: 'single' },
  { name: 'Tick', uri: 'preset:tick', category: 'geiger' },
  { name: 'Hard Tick', uri: 'preset:tick_hard', category: 'geiger' },
  { name: 'Gamma', uri: 'preset:gamma', category: 'geiger' },
]

export function getAlertPresets(): AlertPreset[] {
  try {
    return native.getAlertPresets()
  } catch {
    return FALLBACK_PRESETS
  }
}

export function previewAlertSound(soundType: AlertSoundType): void {
  native.previewAlertSound(soundType)
}

export function startGeigerSimulation(soundType: string, rangeDepth: number): void {
  try {
    native.startGeigerSimulation(soundType, rangeDepth)
  } catch {
    // Native geiger simulation not yet available
  }
}

export function stopGeigerSimulation(): void {
  try {
    native.stopGeigerSimulation()
  } catch {
    // Native geiger simulation not yet available
  }
}

/** Select saved board by app board id. Native reads BLE id/name from its DB and owns connect. */
export async function selectBoard(boardId: string): Promise<void> {
  if (E2E_ENABLED) {
    e2eFake.selectBoard(boardId)
    return
  }

  return native.selectBoard(boardId)
}

/** Stop native board session. GPS monitoring may continue independently. */
export async function stopBoard(): Promise<void> {
  if (E2E_ENABLED) {
    e2eFake.stopBoard()
    return
  }

  return native.stopBoard()
}

/** Stop all native work and remove app task. */
export function exitApp(): void {
  if (E2E_ENABLED) return
  native.exitApp()
}

/**
 * Run a native Board Probe of a BLE peripheral: connect, probe direct and CAN,
 * and return every transport confirmed by a valid Telemetry Sample. Runs before
 * a Board necessarily exists and tears down any live Board Session first.
 * Emits `onBoardProbeProgress` events while it runs.
 */
export async function probeBoardLink(bleId: string): Promise<BoardProbeResult> {
  if (E2E_ENABLED) {
    return e2eFake.probeBoardLink(bleId)
  }

  return native.probeBoardLink(bleId)
}

/** Enable raw debug session recording for future native board sessions. */
export function setDebugRecordingEnabled(enabled: boolean): void {
  native.setDebugRecordingEnabled(enabled)
}

/** List locally retained raw BLE debug captures. Android only. */
export async function listDebugRecordings(): Promise<DebugRecording[]> {
  return native.listDebugRecordings()
}

/** Copy a raw BLE debug capture to cache storage for sharing. Android only. */
export async function exportDebugRecording(name: string): Promise<DatabaseBackupResult> {
  return native.exportDebugRecording(name)
}

/** Report a JS view-layer failure. Native failures are reported at their own operation boundary. */
export function reportUiError(
  message: string,
  source?: string | null,
  stack?: string | null,
): void {
  native.reportUiError(message, source ?? null, stack ?? null)
}

/** Send a manual native diagnostic event from development tooling. */
export function reportDiagnosticTest(): DiagnosticStatus {
  return native.reportDiagnosticTest()
}

/** Read native diagnostic reporter state for development tooling. */
export function getDiagnosticStatus(): DiagnosticStatus {
  return native.getDiagnosticStatus()
}

/** Read native-owned live state. UI should mirror this, not invent connection state. */
export function getLiveState(): LiveStateEvent {
  if (E2E_ENABLED) return e2eFake.getLiveState(native.getLiveState())
  return native.getLiveState()
}

/** Read remote tilt without reseeding native telemetry into the JS history buffer. */
export function getRemoteTiltState(): RemoteTiltState | null {
  if (E2E_ENABLED) return null
  return native.getRemoteTiltState()
}

/** Persist native auto-connect target. Native can use this while JS is frozen. */
export function setSelectedBoard(boardId: string | null): void {
  if (E2E_ENABLED) {
    e2eFake.setSelectedBoard(boardId)
    return
  }

  native.setSelectedBoard(boardId)
}

export async function getTelemetryHistory(
  options: TelemetryHistoryOptions = {},
): Promise<TelemetryMinuteBucket[]> {
  return native.getTelemetryHistory(options)
}

export async function getTelemetrySamples(options: {
  fromMs: number
  toMs: number
  deviceId?: string
  limit?: number
}): Promise<TelemetrySample[]> {
  return native.getTelemetrySamples(options)
}

export async function getHistoryRange(options: {
  fromMs: number
  toMs: number
  deviceId?: string
  limit?: number
}): Promise<HistoryRange> {
  const range = await native.getHistoryRange(options)
  return {
    boardSamples: decodeBoardSamples(range),
    gpsSamples: range.gpsSamples,
    markers: range.markers,
    exclusions: range.exclusions,
  }
}

export async function getTelemetrySummary(): Promise<TelemetrySummary> {
  return native.getTelemetrySummary()
}

export async function getDiagnosticEvents(
  options: DiagnosticEventOptions = {},
): Promise<LocalDiagnosticEvent[]> {
  return native.getDiagnosticEvents(options)
}

export async function clearDiagnosticEvents(): Promise<void> {
  return native.clearDiagnosticEvents()
}

export async function getDatabaseSizeBytes(): Promise<number> {
  return native.getDatabaseSizeBytes()
}

export async function backupDatabase(): Promise<DatabaseBackupResult> {
  return native.backupDatabase()
}

export async function restoreDatabase(uri: string): Promise<void> {
  return native.restoreDatabase(uri)
}

export async function getRefloatConfigSnapshot(): Promise<RefloatConfigSnapshot> {
  return native.getRefloatConfigSnapshot()
}

/**
 * Stream Floaty's temporary remote-tilt input. `value` is the 0..255 slider
 * (128 = neutral). Requires `inputtilt_remote_type` = UART in the board config.
 */
export async function setRemoteTilt(value: number): Promise<boolean> {
  if (E2E_ENABLED) return true
  return native.setRemoteTilt(value)
}

/** Lock the held tilt indefinitely (lock band) until cancelled. */
export async function lockRemoteTilt(value: number): Promise<boolean> {
  if (E2E_ENABLED) return true
  return native.lockRemoteTilt(value)
}

/**
 * Release the pad: ease `value` (0..255) linearly back to neutral over
 * `durationMs`, then stop. A zero duration snaps straight to neutral.
 */
export async function releaseRemoteTilt(value: number, durationMs: number): Promise<boolean> {
  if (E2E_ENABLED) return true
  return native.releaseRemoteTilt(value, durationMs)
}

/** Stop streaming tilt and snap the board back to neutral. */
export async function stopRemoteTilt(): Promise<boolean> {
  if (E2E_ENABLED) return true
  return native.stopRemoteTilt()
}

export async function getTuneProfiles(boardId: string): Promise<TuneProfile[]> {
  return native.getTuneProfiles(boardId)
}

export async function getTuneProfile(profileId: string): Promise<TuneProfile | null> {
  return native.getTuneProfile(profileId)
}

export async function createProfile(
  boardId: string,
  name: string,
  fields: Record<string, TuneProfileFieldValue>,
): Promise<TuneProfile> {
  return native.createProfile(boardId, name, fields)
}

export async function renameProfile(profileId: string, name: string): Promise<TuneProfile> {
  return native.renameProfile(profileId, name)
}

export async function deleteProfile(profileId: string): Promise<void> {
  return native.deleteProfile(profileId)
}

export async function getProfileHistory(profileId: string): Promise<TuneHistoryEntry[]> {
  return native.getProfileHistory(profileId)
}

export async function rollbackProfile(
  profileId: string,
  historyEntryId: number,
): Promise<TuneProfile> {
  return native.rollbackProfile(profileId, historyEntryId)
}

export async function copyProfileToBoard(
  profileId: string,
  targetBoardId: string,
  newName: string,
): Promise<TuneProfile> {
  return native.copyProfileToBoard(profileId, targetBoardId, newName)
}

export async function saveProfile(
  profileId: string,
  fields: Record<string, TuneProfileFieldValue>,
): Promise<TuneProfile> {
  return native.saveProfile(profileId, fields)
}

export async function pushProfileToBoard(profileId: string): Promise<RefloatConfigSnapshot> {
  return native.pushProfileToBoard(profileId)
}

export async function getTotalProfileStats(): Promise<ProfileStats> {
  return native.getTotalProfileStats()
}

export async function getMonthlyProfileStats(options: ProfileStatsMonth): Promise<ProfileStats> {
  return native.getMonthlyProfileStats(options)
}

export async function getProfileStatMonths(): Promise<ProfileStatsMonth[]> {
  return native.getProfileStatMonths()
}

export async function rebuildTelemetryBuckets(): Promise<number> {
  return native.rebuildTelemetryBuckets()
}

export async function deleteTelemetryBefore(beforeMs: number): Promise<number> {
  return native.deleteTelemetryBefore(beforeMs)
}

export async function deleteTelemetryRange(options: TelemetryDeleteRangeOptions): Promise<number> {
  return native.deleteTelemetryRange(options)
}

export async function clearTelemetryHistory(): Promise<void> {
  return native.clearTelemetryHistory()
}

export async function getBoards(): Promise<Board[]> {
  if (E2E_ENABLED) {
    return e2eFake.getBoards()
  }
  return native.getBoards()
}

export async function upsertBoard(board: Board): Promise<void> {
  if (E2E_ENABLED) {
    e2eFake.upsertBoard(board)
    return
  }
  return native.upsertBoard(board)
}

export async function deleteBoard(id: string): Promise<void> {
  return native.deleteBoard(id)
}

export async function getAlertRules(): Promise<AlertRule[]> {
  return native.getAlertRules()
}

export async function upsertAlertRule(rule: AlertRule): Promise<void> {
  return native.upsertAlertRule(rule)
}

export async function setAlertRuleEnabled(id: string, enabled: boolean): Promise<void> {
  return native.setAlertRuleEnabled(id, enabled)
}

export async function deleteAlertRule(id: string): Promise<void> {
  return native.deleteAlertRule(id)
}

export async function getPrivacyZones(): Promise<PrivacyZone[]> {
  return native.getPrivacyZones()
}

export async function upsertPrivacyZone(zone: PrivacyZone): Promise<void> {
  return native.upsertPrivacyZone(zone)
}

export async function setPrivacyZoneEnabled(id: string, enabled: boolean): Promise<void> {
  return native.setPrivacyZoneEnabled(id, enabled)
}

export async function deletePrivacyZone(id: string): Promise<void> {
  return native.deletePrivacyZone(id)
}

export async function getMapPoints(): Promise<MapPoint[]> {
  return native.getMapPoints()
}

export async function upsertMapPoint(point: MapPoint): Promise<void> {
  return native.upsertMapPoint(point)
}

export async function replaceDirectionMapPoint(point: MapPoint): Promise<void> {
  return native.replaceDirectionMapPoint(point)
}

export async function deleteMapPoint(id: string): Promise<void> {
  return native.deleteMapPoint(id)
}

export async function getSettings(): Promise<AppSettings> {
  if (E2E_ENABLED) {
    return e2eFake.getSettings()
  }
  return native.getSettings()
}

export async function updateSetting(
  key: string,
  value: number | boolean | string | Record<string, unknown> | null,
): Promise<void> {
  if (E2E_ENABLED) {
    e2eFake.updateSetting(key, value)
    return
  }
  return native.updateSetting(key, value)
}

export async function setCompanionPresenceEnabled(enabled: boolean): Promise<void> {
  if (E2E_ENABLED) {
    e2eFake.updateSetting('companionPresenceEnabled', enabled)
    return
  }
  return native.setCompanionPresenceEnabled(enabled)
}

export function seedE2EData(flow: string): void {
  if (E2E_ENABLED) {
    e2eFake.seedE2EData(flow)
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function addDeviceListener(cb: (event: DeviceFoundEvent) => void): EventSubscription {
  if (E2E_ENABLED) {
    return e2eFake.addDeviceListener(cb)
  }

  return emitter.addListener('onDevice', cb)
}

export function addErrorListener(cb: (event: ErrorEvent) => void): EventSubscription {
  return emitter.addListener('onError', cb)
}

export function addLiveStateListener(cb: (event: LiveStateEvent) => void): EventSubscription {
  if (E2E_ENABLED) {
    return e2eFake.addLiveStateListener(cb)
  }

  return emitter.addListener('onLiveState', cb)
}

export function addLiveTickListener(cb: (event: TelemetryEvent) => void): EventSubscription {
  if (E2E_ENABLED) {
    return e2eFake.addLiveTickListener(cb)
  }

  return emitter.addListener('onLiveTick', cb)
}

export function addLiveSeriesListener(cb: (event: LiveSeriesEvent) => void): EventSubscription {
  if (E2E_ENABLED) {
    return e2eFake.addLiveSeriesListener(cb)
  }

  return emitter.addListener('onLiveSeries', cb)
}

export function addTelemetryHistoryListener(
  cb: (event: TelemetryHistoryEvent) => void,
): EventSubscription {
  if (E2E_ENABLED) {
    return e2eFake.addTelemetryHistoryListener(cb)
  }

  return emitter.addListener('onTelemetryHistory', cb)
}

export function addBmsListener(cb: (event: BmsEvent) => void): EventSubscription {
  return emitter.addListener('onBms', cb)
}

export function addLocationListener(cb: (event: LocationEvent) => void): EventSubscription {
  return emitter.addListener('onLocation', cb)
}

export function addTelemetryRebuildProgressListener(
  cb: (event: TelemetryRebuildProgressEvent) => void,
): EventSubscription {
  return emitter.addListener('onTelemetryRebuildProgress', cb)
}

export function addBoardProbeProgressListener(
  cb: (event: BoardProbeProgressEvent) => void,
): EventSubscription {
  if (E2E_ENABLED) {
    return e2eFake.addBoardProbeProgressListener(cb)
  }

  return emitter.addListener('onBoardProbeProgress', cb)
}
