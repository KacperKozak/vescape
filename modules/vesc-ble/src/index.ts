import { requireNativeModule, type EventSubscription } from 'expo-modules-core'

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

export interface Board {
  id: string
  name: string
  description: string | null
  bleId: string | null
  isStarred: boolean
  createdAt: number
  minVoltage: number | null
  maxVoltage: number | null
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

export interface TelemetryEvent {
  generation?: number
  location?: LocationEvent | null
  hasFault: boolean
  faultCode: number
  pitch: number
  roll: number
  balancePitch: number
  balanceCurrent: number
  speed: number
  batteryVoltage: number
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

export type BoardPhase = SessionStatus
export type GpsPhase = 'idle' | 'starting' | 'active' | 'error'
export type ScanPhase = ScanStatus

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

export interface TelemetryDeleteRangeOptions {
  fromMs: number
  toMs: number
  deviceId?: string | null
}

export interface TelemetryHistoryBlock {
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
  boundaryBefore: 'none' | 'connected' | 'disconnected' | 'error' | 'gap' | 'app_stop'
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
  type: 'connected' | 'disconnected' | 'error' | 'gap' | 'app_stop'
  deviceId: string | null
  deviceName: string | null
  message: string | null
  gapMs: number | null
}

export interface HistoryRange {
  boardSamples: TelemetrySample[]
  gpsSamples: HistoryGpsSample[]
  markers: HistoryMarker[]
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
  rainRadarEnabled: boolean
}

export interface DiagnosticStatus {
  enabled: boolean
  host: string
  distinctId: string | null
  captureCount: number
  lastEventName: string | null
  lastCaptureAt: number | null
}

// ---------------------------------------------------------------------------
// Typed emitter
// ---------------------------------------------------------------------------

type VescBleEvents = {
  onDevice: (event: DeviceFoundEvent) => void
  onError: (event: ErrorEvent) => void
  onLiveState: (event: LiveStateEvent) => void
  onTelemetry: (event: TelemetryEvent) => void
  onLocation: (event: LocationEvent) => void
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
  setDebugRecordingEnabled(enabled: boolean): void
  reportUiError(message: string, source?: string | null, stack?: string | null): void
  reportDiagnosticTest(): DiagnosticStatus
  getDiagnosticStatus(): DiagnosticStatus
  getLiveState(): LiveStateEvent
  setSelectedBoard(boardId: string | null): void
  getTelemetryHistory(options: TelemetryHistoryOptions): Promise<TelemetryHistoryBlock[]>
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
  }): Promise<HistoryRange>
  getTelemetrySummary(): Promise<TelemetrySummary>
  getDatabaseSizeBytes(): Promise<number>
  getRefloatConfigSnapshot(): Promise<RefloatConfigSnapshot>
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
  getSettings(): Promise<AppSettings>
  updateSetting(key: string, value: number | boolean | string | null): Promise<void>
}

const native = requireNativeModule<VescBleNativeModule>('VescBle')
const emitter = native

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Start BLE scan — emits onDevice events for every advertisement received. */
export function scan(): void {
  native.scan()
}

/** Stop ongoing BLE scan. */
export function stopScan(): void {
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
  return native.selectBoard(boardId)
}

/** Stop native board session. GPS monitoring may continue independently. */
export async function stopBoard(): Promise<void> {
  return native.stopBoard()
}

/** Enable raw debug session recording for future native board sessions. */
export function setDebugRecordingEnabled(enabled: boolean): void {
  native.setDebugRecordingEnabled(enabled)
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
  return native.getLiveState()
}

/** Persist native auto-connect target. Native can use this while JS is frozen. */
export function setSelectedBoard(boardId: string | null): void {
  native.setSelectedBoard(boardId)
}

export async function getTelemetryHistory(
  options: TelemetryHistoryOptions = {},
): Promise<TelemetryHistoryBlock[]> {
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
  return native.getHistoryRange(options)
}

export async function getTelemetrySummary(): Promise<TelemetrySummary> {
  return native.getTelemetrySummary()
}

export async function getDatabaseSizeBytes(): Promise<number> {
  return native.getDatabaseSizeBytes()
}

export async function getRefloatConfigSnapshot(): Promise<RefloatConfigSnapshot> {
  return native.getRefloatConfigSnapshot()
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
  return native.getBoards()
}

export async function upsertBoard(board: Board): Promise<void> {
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

export async function getSettings(): Promise<AppSettings> {
  return native.getSettings()
}

export async function updateSetting(
  key: string,
  value: number | boolean | string | null,
): Promise<void> {
  return native.updateSetting(key, value)
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

export function addDeviceListener(cb: (event: DeviceFoundEvent) => void): EventSubscription {
  return emitter.addListener('onDevice', cb)
}

export function addErrorListener(cb: (event: ErrorEvent) => void): EventSubscription {
  return emitter.addListener('onError', cb)
}

export function addLiveStateListener(cb: (event: LiveStateEvent) => void): EventSubscription {
  return emitter.addListener('onLiveState', cb)
}

export function addTelemetryListener(cb: (event: TelemetryEvent) => void): EventSubscription {
  return emitter.addListener('onTelemetry', cb)
}

export function addLocationListener(cb: (event: LocationEvent) => void): EventSubscription {
  return emitter.addListener('onLocation', cb)
}
