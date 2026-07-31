package expo.modules.vescapecore.telemetry

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

// @parity /modules/vescape-core/ios/alerts/AlertEngine.swift
const val TELEMETRY_FLAG_KEYFRAME = 1
const val TELEMETRY_FLAG_HAS_FAULT = 1 shl 1
const val TELEMETRY_FLAG_HAS_LOCATION = 1 shl 2

const val TELEMETRY_MASK_SPEED = 1
const val TELEMETRY_MASK_BATTERY_VOLTAGE = 1 shl 1
const val TELEMETRY_MASK_MOTOR_CURRENT = 1 shl 2
const val TELEMETRY_MASK_BATTERY_CURRENT = 1 shl 3
const val TELEMETRY_MASK_DUTY = 1 shl 4
const val TELEMETRY_MASK_PITCH = 1 shl 5
const val TELEMETRY_MASK_ROLL = 1 shl 6
const val TELEMETRY_MASK_BALANCE_PITCH = 1 shl 7
const val TELEMETRY_MASK_BALANCE_CURRENT = 1 shl 8
const val TELEMETRY_MASK_ERPM = 1 shl 9
const val TELEMETRY_MASK_STATE = 1 shl 10
const val TELEMETRY_MASK_SWITCH_STATE = 1 shl 11
const val TELEMETRY_MASK_ADC1 = 1 shl 12
const val TELEMETRY_MASK_ADC2 = 1 shl 13
const val TELEMETRY_MASK_ODOMETER = 1 shl 14
const val TELEMETRY_MASK_TEMP_MOSFET = 1 shl 15
const val TELEMETRY_MASK_TEMP_MOTOR = 1 shl 16
const val TELEMETRY_MASK_FAULT_CODE = 1 shl 17

const val TELEMETRY_MASK2_LOCATION = 1

@Entity(
  tableName = "telemetry_frames",
  indices = [
    Index(value = ["captured_at_ms"]),
    Index(value = ["device_id", "captured_at_ms"]),
  ],
)
data class TelemetryFrameEntity(
  @androidx.room.PrimaryKey(autoGenerate = true)
  val id: Long = 0,
  @ColumnInfo(name = "captured_at_ms")
  val capturedAtMs: Long,
  @ColumnInfo(name = "elapsed_realtime_ms")
  val elapsedRealtimeMs: Long,
  @ColumnInfo(name = "device_id")
  val deviceId: String?,
  @ColumnInfo(name = "device_name")
  val deviceName: String?,
  @ColumnInfo(name = "can_id")
  val canId: Int?,
  val flags: Int,
  @ColumnInfo(name = "changed_mask_1")
  val changedMask1: Int,
  @ColumnInfo(name = "changed_mask_2")
  val changedMask2: Int,
  @ColumnInfo(name = "speed_centi_kmh")
  val speedCentiKmh: Int?,
  @ColumnInfo(name = "battery_voltage_mv")
  val batteryVoltageMv: Int?,
  @ColumnInfo(name = "motor_current_ma")
  val motorCurrentMa: Int?,
  @ColumnInfo(name = "battery_current_ma")
  val batteryCurrentMa: Int?,
  @ColumnInfo(name = "duty_permille")
  val dutyPermille: Int?,
  @ColumnInfo(name = "pitch_centi_deg")
  val pitchCentiDeg: Int?,
  @ColumnInfo(name = "roll_centi_deg")
  val rollCentiDeg: Int?,
  @ColumnInfo(name = "balance_pitch_centi_deg")
  val balancePitchCentiDeg: Int?,
  @ColumnInfo(name = "balance_current_ma")
  val balanceCurrentMa: Int?,
  val erpm: Int?,
  val state: Int?,
  @ColumnInfo(name = "switch_state")
  val switchState: Int?,
  @ColumnInfo(name = "adc1_milli")
  val adc1Milli: Int?,
  @ColumnInfo(name = "adc2_milli")
  val adc2Milli: Int?,
  @ColumnInfo(name = "odometer_cm")
  val odometerCm: Long?,
  @ColumnInfo(name = "temp_mosfet_deci_c")
  val tempMosfetDeciC: Int?,
  @ColumnInfo(name = "temp_motor_deci_c")
  val tempMotorDeciC: Int?,
  @ColumnInfo(name = "fault_code")
  val faultCode: Int?,
  @ColumnInfo(name = "latitude_e7")
  val latitudeE7: Int?,
  @ColumnInfo(name = "longitude_e7")
  val longitudeE7: Int?,
  @ColumnInfo(name = "gps_speed_centi_mps")
  val gpsSpeedCentiMps: Int?,
  @ColumnInfo(name = "bearing_centi_deg")
  val bearingCentiDeg: Int?,
  @ColumnInfo(name = "accuracy_cm")
  val accuracyCm: Int?,
  @ColumnInfo(name = "altitude_cm")
  val altitudeCm: Int?,
  @ColumnInfo(name = "location_timestamp_ms")
  val locationTimestampMs: Long?,
)

@Entity(
  tableName = "telemetry_minute_buckets",
  primaryKeys = ["bucket_start_ms", "device_id"],
  indices = [
    Index(value = ["bucket_start_ms"]),
    Index(value = ["updated_at"]),
    Index(value = ["sync_seq"]),
  ],
)
data class TelemetryMinuteBucketEntity(
  @ColumnInfo(name = "bucket_start_ms")
  val bucketStartMs: Long,
  @ColumnInfo(name = "device_id")
  val deviceId: String,
  @ColumnInfo(name = "device_name")
  val deviceName: String?,
  @ColumnInfo(name = "sample_count")
  val sampleCount: Int,
  @ColumnInfo(name = "first_sample_at_ms")
  val firstSampleAtMs: Long,
  @ColumnInfo(name = "last_sample_at_ms")
  val lastSampleAtMs: Long,
  @ColumnInfo(name = "sum_abs_speed_centi_kmh")
  val sumAbsSpeedCentiKmh: Long,
  @ColumnInfo(name = "moving_speed_sample_count")
  val movingSpeedSampleCount: Int?,
  @ColumnInfo(name = "sum_moving_abs_speed_centi_kmh")
  val sumMovingAbsSpeedCentiKmh: Long?,
  @ColumnInfo(name = "max_abs_speed_centi_kmh")
  val maxAbsSpeedCentiKmh: Int,
  @ColumnInfo(name = "min_battery_voltage_mv")
  val minBatteryVoltageMv: Int?,
  @ColumnInfo(name = "max_motor_current_abs_ma")
  val maxMotorCurrentAbsMa: Int,
  @ColumnInfo(name = "max_battery_current_abs_ma")
  val maxBatteryCurrentAbsMa: Int,
  @ColumnInfo(name = "battery_used_wh_milli")
  val batteryUsedWhMilli: Long,
  @ColumnInfo(name = "battery_regen_wh_milli")
  val batteryRegenWhMilli: Long,
  @ColumnInfo(name = "max_duty_abs_permille")
  val maxDutyAbsPermille: Int,
  @ColumnInfo(name = "fault_count")
  val faultCount: Int,
  @ColumnInfo(name = "first_odometer_cm")
  val firstOdometerCm: Long?,
  @ColumnInfo(name = "last_odometer_cm")
  val lastOdometerCm: Long?,
  @ColumnInfo(name = "gps_point_count")
  val gpsPointCount: Int,
  @ColumnInfo(name = "precise_gps_point_count")
  val preciseGpsPointCount: Int,
  @ColumnInfo(name = "gps_distance_cm")
  val gpsDistanceCm: Long,
  @ColumnInfo(name = "max_gps_speed_centi_mps")
  val maxGpsSpeedCentiMps: Int?,
  @ColumnInfo(name = "max_temp_mosfet_deci_c")
  val maxTempMosfetDeciC: Int? = null,
  @ColumnInfo(name = "max_temp_motor_deci_c")
  val maxTempMotorDeciC: Int? = null,
  @ColumnInfo(name = "first_latitude_e7")
  val firstLatitudeE7: Int? = null,
  @ColumnInfo(name = "first_longitude_e7")
  val firstLongitudeE7: Int? = null,
  @ColumnInfo(name = "first_moving_at_ms")
  val firstMovingAtMs: Long? = null,
  @ColumnInfo(name = "last_moving_at_ms")
  val lastMovingAtMs: Long? = null,
  /**
   * Last-write-wins timestamp: wall-clock epoch ms of the last write to this bucket. Distinct from
   * [lastSampleAtMs], which tracks the newest *sample* in the bucket — a merge that folds in older
   * samples, or a bucket rebuild, changes the row without moving that.
   *
   * Not the Sync Cursor column; [syncSeq] is. This one crosses the wire and decides which of two
   * writes to the same row the server keeps, so it stays a truthful wall clock.
   */
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
  /** Device-local Sync Cursor position; see [SyncSequenceEntity]. */
  @ColumnInfo(name = "sync_seq")
  val syncSeq: Long = 0,
)

@Entity(
  tableName = "telemetry_markers",
  indices = [
    Index(value = ["occurred_at_ms"]),
    Index(value = ["device_id", "occurred_at_ms"]),
  ],
)
data class TelemetryMarkerEntity(
  @androidx.room.PrimaryKey(autoGenerate = true)
  val id: Long = 0,
  @ColumnInfo(name = "occurred_at_ms")
  val occurredAtMs: Long,
  @ColumnInfo(name = "elapsed_realtime_ms")
  val elapsedRealtimeMs: Long,
  val type: String,
  @ColumnInfo(name = "device_id")
  val deviceId: String?,
  @ColumnInfo(name = "device_name")
  val deviceName: String?,
  val message: String?,
  @ColumnInfo(name = "gap_ms")
  val gapMs: Long?,
)

@Entity(
  tableName = "diagnostic_events",
  indices = [
    Index(value = ["occurred_at_ms"]),
    Index(value = ["event_name"]),
    Index(value = ["device_id", "occurred_at_ms"]),
  ],
)
data class DiagnosticEventEntity(
  @androidx.room.PrimaryKey(autoGenerate = true)
  val id: Long = 0,
  @ColumnInfo(name = "occurred_at_ms")
  val occurredAtMs: Long,
  @ColumnInfo(name = "elapsed_realtime_ms")
  val elapsedRealtimeMs: Long,
  @ColumnInfo(name = "event_name")
  val eventName: String,
  val operation: String?,
  val phase: String?,
  @ColumnInfo(name = "device_id")
  val deviceId: String?,
  @ColumnInfo(name = "device_name")
  val deviceName: String?,
  val message: String?,
  @ColumnInfo(name = "properties_json")
  val propertiesJson: String,
)

@Entity(
  tableName = "boards",
  indices = [
    Index(value = ["created_at"]),
    Index(value = ["updated_at"]),
    Index(value = ["sync_seq"]),
  ],
)
data class BoardEntity(
  @PrimaryKey
  val id: String,
  val name: String,
  @ColumnInfo(name = "ble_id")
  val bleId: String?,
  @ColumnInfo(name = "created_at")
  val createdAt: Long,
  /**
   * Last-write-wins timestamp: epoch ms of the last write to this row, from the same clock as
   * [createdAt]. Equal to [createdAt] on insert and bumped on every mutation. It crosses the wire
   * and is what the server compares to decide which of two writes to this row it keeps, so it stays
   * a truthful wall clock rather than a counter.
   *
   * Ratcheted to `max(previous + 1, now)` on write. A device clock that steps backwards would
   * otherwise stamp an edit below the copy the server already holds, and the server's
   * last-write-wins guard would silently drop it. Per row, so the inflation is bounded by the
   * rewind and disappears once the wall clock passes it again.
   */
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
  /** Device-local Sync Cursor position; see [SyncSequenceEntity]. */
  @ColumnInfo(name = "sync_seq")
  val syncSeq: Long = 0,
)

@Entity(
  tableName = "board_settings",
  primaryKeys = ["board_id", "key"],
  indices = [
    Index(value = ["board_id"]),
  ],
)
data class BoardSettingEntity(
  @ColumnInfo(name = "board_id")
  val boardId: String,
  val key: String,
  @ColumnInfo(name = "value_json")
  val valueJson: String,
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
)

@Entity(
  tableName = "alerts",
  primaryKeys = ["board_id", "id"],
  indices = [
    Index(value = ["board_id"]),
    Index(value = ["control_id"]),
    Index(value = ["enabled"]),
    Index(value = ["created_at"]),
    Index(value = ["updated_at"]),
    Index(value = ["sync_seq"]),
  ],
)
data class AlertRuleEntity(
  @ColumnInfo(name = "board_id")
  val boardId: String,
  val id: String,
  @ColumnInfo(name = "control_id")
  val controlId: String,
  val threshold: Double,
  @ColumnInfo(name = "threshold_max")
  val thresholdMax: Double?,
  val enabled: Boolean,
  @ColumnInfo(name = "sound_type")
  val soundType: String,
  @ColumnInfo(name = "created_at")
  val createdAt: Long,
  /**
   * Free-text provenance tag mirroring TS `AlertRule.source`: `manual` (or null) or `preset`.
   * JS authors and regenerates preset rules; native only persists the string.
   */
  val source: String?,
  /**
   * Last-write-wins timestamp, ratcheted on write exactly as [BoardEntity.updatedAt] is, and moved
   * by every mutation including the targeted enable/disable update.
   */
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
  /** Device-local Sync Cursor position; see [SyncSequenceEntity]. */
  @ColumnInfo(name = "sync_seq")
  val syncSeq: Long = 0,
)

/**
 * One counter per syncable table, handing out the strictly increasing `sync_seq` those tables stamp
 * on every write.
 *
 * The Sync Cursor is the phone's own record of how far it has uploaded, and it never crosses the
 * wire — the server stores no watermark and has no opinion about one. That is what lets the scan
 * run on a counter instead of a clock: a device clock that steps backwards makes an
 * `updated_at >= watermark` scan skip the write entirely, because the row lands below a cursor the
 * phone already passed. A counter cannot regress, so the scan stays complete however the clock
 * behaves.
 *
 * The counter lives in its own table rather than being derived as `MAX(sync_seq) + 1` per table:
 * deleting the highest row would hand the same number out twice, and the second row would fall on
 * the wrong side of a cursor already advanced past it.
 */
@Entity(tableName = "sync_sequences")
data class SyncSequenceEntity(
  @PrimaryKey
  val name: String,
  @ColumnInfo(name = "last_value")
  val lastValue: Long,
)

/** Table names used as [SyncSequenceEntity] keys. */
internal const val SYNC_SEQ_BOARDS = "boards"
internal const val SYNC_SEQ_ALERTS = "alerts"
internal const val SYNC_SEQ_MINUTE_BUCKETS = "telemetry_minute_buckets"

/** Every table carrying a `sync_seq`, in the order the migration adds it. */
internal val SYNC_SEQ_TABLES = listOf(SYNC_SEQ_BOARDS, SYNC_SEQ_ALERTS, SYNC_SEQ_MINUTE_BUCKETS)

@Entity(
  tableName = "metric_exclusion_ranges",
  indices = [
    Index(value = ["start_ms", "end_ms"]),
    Index(value = ["device_id", "start_ms", "end_ms"]),
  ],
)
data class MetricExclusionRangeEntity(
  @PrimaryKey(autoGenerate = true)
  val id: Long = 0,
  @ColumnInfo(name = "device_id")
  val deviceId: String,
  val reason: String,
  @ColumnInfo(name = "start_ms")
  val startMs: Long,
  @ColumnInfo(name = "end_ms")
  val endMs: Long,
  @ColumnInfo(name = "sample_count")
  val sampleCount: Int,
)

@Entity(
  tableName = "privacy_zones",
)
data class PrivacyZoneEntity(
  @PrimaryKey
  val id: String,
  val preset: String,
  val name: String,
  val enabled: Boolean,
  @ColumnInfo(name = "center_latitude_e7")
  val centerLatitudeE7: Int,
  @ColumnInfo(name = "center_longitude_e7")
  val centerLongitudeE7: Int,
  @ColumnInfo(name = "radius_meters")
  val radiusMeters: Int,
  @ColumnInfo(name = "created_at")
  val createdAt: Long,
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
)

@Entity(tableName = "app_settings")
data class AppSettingEntity(
  @PrimaryKey
  val key: String,
  @ColumnInfo(name = "value_json")
  val valueJson: String,
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
)

/**
 * Durable app-scoped settings. A TS/Android/iOS parity triangle — the container tag covers every
 * key; individual literals are not tagged separately (see AGENTS.md).
 * @parity /modules/vescape-core/src/index.ts `AppSettings`
 * @parity /modules/vescape-core/ios/telemetry/AppDataRepository.swift `defaultSettings`
 */
data class AppSettings(
  val liveHistoryLimit: Int = 5,
  val autoConnect: Boolean = true,
  val autoRecording: Boolean = false,
  val selectedBoardId: String? = null,
  val lastGpsLatitude: Double? = null,
  val lastGpsLongitude: Double? = null,
  val directionPointLatitude: Double? = null,
  val directionPointLongitude: Double? = null,
  val movingSpeedThresholdKmh: Double = 3.0,
  val freeSpinMaxSpeedDeltaKmh: Double = DEFAULT_FREE_SPIN_MAX_SPEED_DELTA_KMH,
  val freeSpinStationaryBoardCapKmh: Double = DEFAULT_FREE_SPIN_STATIONARY_BOARD_CAP_KMH,
  val mapStyleKey: String = "onedark",
  val satelliteOverlayEnabled: Boolean = true,
  val satelliteImageryOpacity: Double = 0.2,
  val satelliteMapImageryOpacity: Double = 1.0,
  val satelliteImagerySaturation: Double = -0.35,
  val hideTelemetryMapDetails: Boolean = true,
  val mapNavigationMode: String = "northUp",
  val historyMetricGradientsEnabled: Boolean = true,
  val historyMetricHotRanges: Map<String, Map<String, Double>> = DEFAULT_HISTORY_METRIC_HOT_RANGES,
  val socEstimateWindowSeconds: Int = 20,
  val connectionSoundsEnabled: Boolean = true,
  val telemetryPollRateHz: Int = 20,
  val wearMirrorIntervalMs: Int = 500,
  val wearAutoLaunchOnConnect: Boolean = true,
  val companionPresenceEnabled: Boolean = false,
  val boardWarningsEnabled: Boolean = true,
  val companionPresenceCooldownMinutes: Int = 60,
  val autoCloseEnabled: Boolean = false,
  val autoCloseDelayMinutes: Int = 15,
  val riderId: String? = null,
  val riderName: String? = null,
  val riderColor: String? = null,
  val legalPolicy: Map<String, String>? = null,
  val dismissedCommunityMessageIds: List<String> = emptyList(),
)

@Entity(
  tableName = "tune_profiles",
  indices = [
    Index(value = ["board_id"]),
    Index(value = ["board_id", "refloat_base_version"]),
  ],
)
data class TuneProfileEntity(
  @PrimaryKey
  val id: String,
  @ColumnInfo(name = "board_id")
  val boardId: String,
  @ColumnInfo(name = "refloat_base_version")
  val refloatBaseVersion: String,
  val name: String,
  val icon: String = "sliders-horizontal",
  val color: String = "purple",
  @ColumnInfo(name = "fields_json")
  val fieldsJson: String,
  @ColumnInfo(name = "created_at")
  val createdAt: Long,
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
)

@Entity(
  tableName = "tune_history_entries",
  indices = [
    Index(value = ["profile_id"]),
    Index(value = ["created_at"]),
  ],
)
data class TuneHistoryEntryEntity(
  @PrimaryKey(autoGenerate = true)
  val id: Long = 0,
  @ColumnInfo(name = "profile_id")
  val profileId: String,
  @ColumnInfo(name = "fields_json")
  val fieldsJson: String,
  @ColumnInfo(name = "created_at")
  val createdAt: Long,
)

/**
 * One durable Board Warning row, keyed one-per-problem-kind per Board (automotive fault-code model).
 * Re-detection upserts the same row, preserving [firstDetectedAtMs] while refreshing severity,
 * [lastDetectedAtMs], and [payloadJson]. Not a time series — a "current known warnings per Board".
 *
 * @parity /modules/vescape-core/ios/warnings/BoardWarningStore.swift
 */
@Entity(
  tableName = "board_warnings",
  primaryKeys = ["board_id", "kind"],
  indices = [
    Index(value = ["board_id"]),
  ],
)
data class BoardWarningEntity(
  @ColumnInfo(name = "board_id")
  val boardId: String,
  val kind: String,
  val severity: String,
  @ColumnInfo(name = "first_detected_at")
  val firstDetectedAt: Long,
  @ColumnInfo(name = "last_detected_at")
  val lastDetectedAt: Long,
  @ColumnInfo(name = "payload_json")
  val payloadJson: String,
)

/**
 * One Favorite: a durable, optionally named time range over Ride History (ADR 0029). Identity and
 * timestamps are native-minted — JS may only supply the range and the name.
 *
 * Summary stats are denormalized at creation/update from raw Telemetry Samples (ADR 0005 style)
 * because minute buckets are too coarse for a range that cuts mid-bucket.
 *
 * @parity /modules/vescape-core/ios/telemetry/FavoriteStore.swift `Favorite`
 * @parity /modules/vescape-core/src/index.ts `Favorite`
 */
@Entity(
  tableName = "favorites",
  indices = [
    Index(value = ["start_ms", "end_ms"]),
    Index(value = ["board_id"]),
  ],
)
data class FavoriteEntity(
  @PrimaryKey
  val id: String,
  /**
   * Owning Board (`boards.id`), or null when the recorded samples match no saved Board. Never the
   * BLE peripheral id: that changes on re-link and differs per install, so it is not an identity.
   */
  @ColumnInfo(name = "board_id")
  val boardId: String?,
  val name: String?,
  @ColumnInfo(name = "start_ms")
  val startMs: Long,
  @ColumnInfo(name = "end_ms")
  val endMs: Long,
  @ColumnInfo(name = "created_at")
  val createdAt: Long,
  @ColumnInfo(name = "updated_at")
  val updatedAt: Long,
  @ColumnInfo(name = "sample_count")
  val sampleCount: Int,
  @ColumnInfo(name = "gps_point_count")
  val gpsPointCount: Int,
  /** Odometer delta across the range, or null when the range carries no odometer readings. */
  @ColumnInfo(name = "distance_cm")
  val distanceCm: Long?,
  @ColumnInfo(name = "moving_duration_ms")
  val movingDurationMs: Long,
  @ColumnInfo(name = "avg_speed_centi_kmh")
  val avgSpeedCentiKmh: Int,
  @ColumnInfo(name = "max_speed_centi_kmh")
  val maxSpeedCentiKmh: Int,
  @ColumnInfo(name = "battery_used_wh_milli")
  val batteryUsedWhMilli: Long,
) {
  /**
   * Board name is resolved on read from `boards`, not snapshotted, so renames propagate.
   *
   * @parity /modules/vescape-core/ios/telemetry/FavoriteStore.swift `Favorite.toMap`
   */
  fun toMap(boardName: String?): Map<String, Any?> = mapOf(
    "id" to id,
    "boardId" to boardId,
    "boardName" to boardName,
    "name" to name,
    "startMs" to startMs,
    "endMs" to endMs,
    "createdAtMs" to createdAt,
    "updatedAtMs" to updatedAt,
    "sampleCount" to sampleCount,
    "gpsPointCount" to gpsPointCount,
    "distanceM" to distanceCm?.let { it / 100.0 },
    "movingDurationMs" to movingDurationMs,
    "avgSpeedKmh" to avgSpeedCentiKmh / 100.0,
    "maxSpeedKmh" to maxSpeedCentiKmh / 100.0,
    "batteryUsedWh" to batteryUsedWhMilli / 1000.0,
  )
}

/**
 * One immutable Favorite Media manifest row. SQLite owns metadata; the canonical file path is
 * derived only from the Favorite and media ids plus the stored MIME type (ADR 0030).
 *
 * @parity /modules/vescape-core/ios/telemetry/FavoriteMediaStore.swift `FavoriteMedia`
 * @parity /modules/vescape-core/src/index.ts `FavoriteMedia`
 */
@Entity(
  tableName = "favorite_media",
  indices = [
    Index(value = ["favorite_id", "created_at"]),
  ],
)
data class FavoriteMediaEntity(
  @PrimaryKey
  val id: String,
  @ColumnInfo(name = "favorite_id")
  val favoriteId: String,
  @ColumnInfo(name = "captured_at")
  val capturedAt: Long?,
  @ColumnInfo(name = "mime_type")
  val mimeType: String,
  @ColumnInfo(name = "media_kind")
  val mediaKind: String,
  @ColumnInfo(name = "byte_count")
  val byteCount: Long,
  @ColumnInfo(name = "content_hash")
  val contentHash: String,
  @ColumnInfo(name = "created_at")
  val createdAt: Long,
) {
  fun toMap(uri: String, filename: String): Map<String, Any?> = mapOf(
    "id" to id,
    "favoriteId" to favoriteId,
    "capturedAtMs" to capturedAt,
    "mimeType" to mimeType,
    "mediaKind" to mediaKind,
    "byteCount" to byteCount,
    "contentHash" to contentHash,
    "createdAtMs" to createdAt,
    "uri" to uri,
    "filename" to filename,
  )
}
