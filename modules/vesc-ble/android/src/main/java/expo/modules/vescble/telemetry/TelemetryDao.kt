package expo.modules.vescble.telemetry

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update

@Dao
interface TelemetryDao {
  @Insert
  suspend fun insertFrames(frames: List<TelemetryFrameEntity>): List<Long>

  @Insert
  suspend fun insertLocations(locations: List<HistoryLocationEntity>): List<Long>

  @Insert
  suspend fun insertMarkers(markers: List<TelemetryMarkerEntity>)

  @Insert(onConflict = OnConflictStrategy.IGNORE)
  suspend fun insertBucket(bucket: TelemetryMinuteBucketEntity): Long

  @Update
  suspend fun updateBucket(bucket: TelemetryMinuteBucketEntity)

  @Query("SELECT * FROM telemetry_minute_buckets WHERE bucket_start_ms = :bucketStartMs AND device_id = :deviceId LIMIT 1")
  suspend fun getBucket(bucketStartMs: Long, deviceId: String): TelemetryMinuteBucketEntity?

  @Transaction
  suspend fun upsertBuckets(buckets: Collection<TelemetryMinuteBucketEntity>) {
    for (bucket in buckets) {
      val existing = getBucket(bucket.bucketStartMs, bucket.deviceId)
      if (existing == null) {
        insertBucket(bucket)
      } else {
        updateBucket(existing.merge(bucket))
      }
    }
  }

  @Transaction
  suspend fun insertBatch(
    frames: List<TelemetryFrameEntity>,
    locations: List<HistoryLocationEntity>,
    buckets: Collection<TelemetryMinuteBucketEntity>,
    markers: List<TelemetryMarkerEntity>,
  ) {
    if (frames.isNotEmpty()) insertFrames(frames)
    if (locations.isNotEmpty()) insertLocations(locations)
    if (buckets.isNotEmpty()) upsertBuckets(buckets)
    if (markers.isNotEmpty()) insertMarkers(markers)
  }

  @Query(
    """
    SELECT * FROM telemetry_minute_buckets
    WHERE (:deviceId IS NULL OR device_id = :deviceId)
      AND bucket_start_ms <= :beforeMs
      AND bucket_start_ms >= :fromMs
      AND bucket_start_ms <= :toMs
    ORDER BY bucket_start_ms DESC
    LIMIT :limit
    """,
  )
  suspend fun getHistoryBuckets(
    fromMs: Long,
    toMs: Long,
    beforeMs: Long,
    deviceId: String?,
    limit: Int,
  ): List<TelemetryMinuteBucketEntity>

  @Query("SELECT * FROM telemetry_minute_buckets ORDER BY bucket_start_ms ASC")
  suspend fun getAllHistoryBucketsAsc(): List<TelemetryMinuteBucketEntity>

  @Query(
    """
    SELECT * FROM telemetry_markers
    WHERE occurred_at_ms >= :fromMs
      AND occurred_at_ms <= :toMs
      AND (:deviceId IS NULL OR device_id = :deviceId)
    ORDER BY occurred_at_ms ASC
    """,
  )
  suspend fun getMarkers(fromMs: Long, toMs: Long, deviceId: String?): List<TelemetryMarkerEntity>

  @Query(
    """
    SELECT * FROM telemetry_frames
    WHERE captured_at_ms <= :fromMs
      AND (:deviceId IS NULL OR device_id = :deviceId)
      AND (flags & :keyframeFlag) != 0
    ORDER BY captured_at_ms DESC
    LIMIT 1
    """,
  )
  suspend fun getLatestKeyframeBefore(
    fromMs: Long,
    deviceId: String?,
    keyframeFlag: Int = TELEMETRY_FLAG_KEYFRAME,
  ): TelemetryFrameEntity?

  @Query(
    """
    SELECT * FROM telemetry_frames
    WHERE captured_at_ms >= :fromMs
      AND captured_at_ms <= :toMs
      AND (:deviceId IS NULL OR device_id = :deviceId)
    ORDER BY captured_at_ms ASC
    LIMIT :limit
    """,
  )
  suspend fun getFrames(fromMs: Long, toMs: Long, deviceId: String?, limit: Int): List<TelemetryFrameEntity>

  @Query(
    """
    SELECT * FROM history_locations
    WHERE captured_at_ms >= :fromMs
      AND captured_at_ms <= :toMs
      AND (:deviceId IS NULL OR device_id = :deviceId)
    ORDER BY captured_at_ms ASC
    LIMIT :limit
    """,
  )
  suspend fun getLocations(fromMs: Long, toMs: Long, deviceId: String?, limit: Int): List<HistoryLocationEntity>

  @Query("SELECT COUNT(*) FROM telemetry_frames")
  suspend fun countFrames(): Long

  @Query("SELECT COUNT(*) FROM history_locations")
  suspend fun countLocations(): Long

  @Query("SELECT MIN(captured_at_ms) FROM telemetry_frames")
  suspend fun firstFrameAt(): Long?

  @Query("SELECT MIN(captured_at_ms) FROM history_locations")
  suspend fun firstLocationAt(): Long?

  @Query("SELECT MAX(captured_at_ms) FROM telemetry_frames")
  suspend fun lastFrameAt(): Long?

  @Query("SELECT MAX(captured_at_ms) FROM history_locations")
  suspend fun lastLocationAt(): Long?

  @Query("DELETE FROM telemetry_frames WHERE captured_at_ms < :beforeMs")
  suspend fun deleteFramesBefore(beforeMs: Long): Int

  @Query("DELETE FROM history_locations WHERE captured_at_ms < :beforeMs")
  suspend fun deleteLocationsBefore(beforeMs: Long): Int

  @Query("DELETE FROM telemetry_markers WHERE occurred_at_ms < :beforeMs")
  suspend fun deleteMarkersBefore(beforeMs: Long): Int

  @Query("DELETE FROM telemetry_minute_buckets WHERE bucket_start_ms < :beforeMs")
  suspend fun deleteBucketsBefore(beforeMs: Long): Int

  @Transaction
  suspend fun deleteBefore(beforeMs: Long): Int {
    val frames = deleteFramesBefore(beforeMs)
    val locations = deleteLocationsBefore(beforeMs)
    deleteMarkersBefore(beforeMs)
    deleteBucketsBefore(beforeMs)
    return frames + locations
  }

  @Query(
    """
    DELETE FROM telemetry_frames
    WHERE captured_at_ms >= :fromMs
      AND captured_at_ms <= :toMs
      AND (
        (:deviceId IS NOT NULL AND device_id = :deviceId)
        OR (:deviceId IS NULL AND device_id IS NULL)
      )
    """,
  )
  suspend fun deleteFramesRange(fromMs: Long, toMs: Long, deviceId: String?): Int

  @Query(
    """
    DELETE FROM history_locations
    WHERE captured_at_ms >= :fromMs
      AND captured_at_ms <= :toMs
      AND (
        (:deviceId IS NOT NULL AND device_id = :deviceId)
        OR (:deviceId IS NULL AND device_id IS NULL)
      )
    """,
  )
  suspend fun deleteLocationsRange(fromMs: Long, toMs: Long, deviceId: String?): Int

  @Query(
    """
    DELETE FROM telemetry_markers
    WHERE occurred_at_ms >= :fromMs
      AND occurred_at_ms <= :toMs
      AND (
        (:deviceId IS NOT NULL AND device_id = :deviceId)
        OR (:deviceId IS NULL AND device_id IS NULL)
      )
    """,
  )
  suspend fun deleteMarkersRange(fromMs: Long, toMs: Long, deviceId: String?): Int

  @Query(
    """
    DELETE FROM telemetry_minute_buckets
    WHERE last_sample_at_ms >= :fromMs
      AND first_sample_at_ms <= :toMs
      AND device_id = :bucketDeviceId
    """,
  )
  suspend fun deleteBucketsRange(fromMs: Long, toMs: Long, bucketDeviceId: String): Int

  @Transaction
  suspend fun deleteRange(fromMs: Long, toMs: Long, deviceId: String?): Int {
    val frames = deleteFramesRange(fromMs, toMs, deviceId)
    val locations = deleteLocationsRange(fromMs, toMs, deviceId)
    deleteMarkersRange(fromMs, toMs, deviceId)
    deleteBucketsRange(fromMs, toMs, deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID)
    return frames + locations
  }

  @Query("DELETE FROM telemetry_frames")
  suspend fun clearFrames()

  @Query("DELETE FROM history_locations")
  suspend fun clearLocations()

  @Query("DELETE FROM telemetry_markers")
  suspend fun clearMarkers()

  @Query("DELETE FROM telemetry_minute_buckets")
  suspend fun clearBuckets()

  @Transaction
  suspend fun clearAll() {
    clearFrames()
    clearLocations()
    clearMarkers()
    clearBuckets()
  }

  @Query("SELECT * FROM boards ORDER BY is_starred DESC, created_at ASC")
  suspend fun getBoards(): List<BoardEntity>

  @Query("SELECT * FROM boards WHERE id = :id LIMIT 1")
  suspend fun getBoard(id: String): BoardEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertBoard(board: BoardEntity)

  @Query("DELETE FROM boards WHERE id = :id")
  suspend fun deleteBoard(id: String)

  @Query("SELECT * FROM alerts ORDER BY created_at ASC")
  suspend fun getAlertRules(): List<AlertRuleEntity>

  @Query("SELECT * FROM alerts WHERE enabled = 1 ORDER BY created_at ASC")
  suspend fun getEnabledAlertRules(): List<AlertRuleEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAlertRule(rule: AlertRuleEntity)

  @Query("UPDATE alerts SET enabled = :enabled WHERE id = :id")
  suspend fun setAlertRuleEnabled(id: String, enabled: Boolean)

  @Query("DELETE FROM alerts WHERE id = :id")
  suspend fun deleteAlertRule(id: String)

  @Query("SELECT * FROM app_settings WHERE id = 1 LIMIT 1")
  suspend fun getSettings(): AppSettingsEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertSettings(settings: AppSettingsEntity)

  @Query("SELECT * FROM tune_profiles WHERE board_id = :boardId ORDER BY created_at ASC")
  suspend fun getTuneProfilesByBoard(boardId: String): List<TuneProfileEntity>

  @Query("SELECT * FROM tune_profiles WHERE id = :id LIMIT 1")
  suspend fun getTuneProfile(id: String): TuneProfileEntity?

  @Query("DELETE FROM tune_profiles WHERE id = :id")
  suspend fun deleteTuneProfile(id: String)

  @Query("DELETE FROM tune_history_entries WHERE profile_id = :profileId")
  suspend fun deleteTuneHistoryForProfile(profileId: String)

  @Query("UPDATE tune_profiles SET name = :name, updated_at = :updatedAt WHERE id = :profileId")
  suspend fun updateProfileName(profileId: String, name: String, updatedAt: Long): Int

  @Query("SELECT * FROM tune_history_entries WHERE id = :id LIMIT 1")
  suspend fun getTuneHistoryEntry(id: Long): TuneHistoryEntryEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertTuneProfile(profile: TuneProfileEntity)

  @Insert(onConflict = OnConflictStrategy.IGNORE)
  suspend fun insertTuneProfile(profile: TuneProfileEntity): Long

  @Query("SELECT COUNT(*) FROM tune_profiles WHERE board_id = :boardId")
  suspend fun countTuneProfilesForBoard(boardId: String): Int

  @Insert
  suspend fun insertTuneHistoryEntry(entry: TuneHistoryEntryEntity): Long

  @Query("SELECT * FROM tune_history_entries WHERE profile_id = :profileId ORDER BY created_at DESC")
  suspend fun getTuneHistoryEntries(profileId: String): List<TuneHistoryEntryEntity>

  @Query("UPDATE tune_profiles SET fields_json = :fieldsJson, updated_at = :updatedAt WHERE id = :profileId")
  suspend fun updateProfileFields(profileId: String, fieldsJson: String, updatedAt: Long): Int

  @Transaction
  suspend fun saveTuneProfile(profileId: String, fieldsJson: String, updatedAt: Long): TuneProfileEntity {
    val current = getTuneProfile(profileId) ?: throw IllegalArgumentException("Tune Profile not found: $profileId")
    insertTuneHistoryEntry(
      TuneHistoryEntryEntity(
        profileId = current.id,
        fieldsJson = current.fieldsJson,
        createdAt = updatedAt,
      ),
    )
    updateProfileFields(profileId, fieldsJson, updatedAt)
    return getTuneProfile(profileId) ?: throw IllegalStateException("Tune Profile disappeared during save: $profileId")
  }

  @Transaction
  suspend fun deleteTuneProfileSafe(profileId: String) {
    val profile = getTuneProfile(profileId) ?: throw IllegalArgumentException("Tune Profile not found: $profileId")
    if (countTuneProfilesForBoard(profile.boardId) <= 1) {
      throw IllegalStateException("Cannot delete the last profile for a board")
    }
    deleteTuneHistoryForProfile(profileId)
    deleteTuneProfile(profileId)
  }

  @Transaction
  suspend fun rollbackTuneProfile(profileId: String, historyEntryId: Long): TuneProfileEntity {
    val profile = getTuneProfile(profileId) ?: throw IllegalArgumentException("Tune Profile not found: $profileId")
    val entry = getTuneHistoryEntry(historyEntryId) ?: throw IllegalArgumentException("History entry not found: $historyEntryId")
    if (entry.profileId != profileId) throw IllegalArgumentException("History entry does not belong to this profile")
    val now = System.currentTimeMillis()
    insertTuneHistoryEntry(
      TuneHistoryEntryEntity(
        profileId = profile.id,
        fieldsJson = profile.fieldsJson,
        createdAt = now,
      ),
    )
    updateProfileFields(profileId, entry.fieldsJson, now)
    return getTuneProfile(profileId) ?: throw IllegalStateException("Tune Profile disappeared during rollback: $profileId")
  }

  @Transaction
  suspend fun insertTuneProfileIfBoardHasNone(
    profile: TuneProfileEntity,
    historyEntry: TuneHistoryEntryEntity,
  ): TuneProfileEntity? {
    if (countTuneProfilesForBoard(profile.boardId) > 0) return null
    val inserted = insertTuneProfile(profile)
    if (inserted == -1L) return null
    insertTuneHistoryEntry(historyEntry)
    return profile
  }
}

private fun TelemetryMinuteBucketEntity.merge(next: TelemetryMinuteBucketEntity): TelemetryMinuteBucketEntity {
  return copy(
    deviceName = next.deviceName ?: deviceName,
    sampleCount = sampleCount + next.sampleCount,
    firstSampleAtMs = minOf(firstSampleAtMs, next.firstSampleAtMs),
    lastSampleAtMs = maxOf(lastSampleAtMs, next.lastSampleAtMs),
    sumAbsSpeedCentiKmh = sumAbsSpeedCentiKmh + next.sumAbsSpeedCentiKmh,
    maxAbsSpeedCentiKmh = maxOf(maxAbsSpeedCentiKmh, next.maxAbsSpeedCentiKmh),
    minBatteryVoltageMv = when {
      minBatteryVoltageMv == null -> next.minBatteryVoltageMv
      next.minBatteryVoltageMv == null -> minBatteryVoltageMv
      else -> minOf(minBatteryVoltageMv, next.minBatteryVoltageMv)
    },
    maxMotorCurrentAbsMa = maxOf(maxMotorCurrentAbsMa, next.maxMotorCurrentAbsMa),
    maxBatteryCurrentAbsMa = maxOf(maxBatteryCurrentAbsMa, next.maxBatteryCurrentAbsMa),
    batteryUsedWhMilli = batteryUsedWhMilli + next.batteryUsedWhMilli,
    batteryRegenWhMilli = batteryRegenWhMilli + next.batteryRegenWhMilli,
    maxDutyAbsPermille = maxOf(maxDutyAbsPermille, next.maxDutyAbsPermille),
    faultCount = faultCount + next.faultCount,
    firstOdometerCm = when {
      firstOdometerCm == null -> next.firstOdometerCm
      next.firstOdometerCm == null -> firstOdometerCm
      next.firstSampleAtMs < firstSampleAtMs -> next.firstOdometerCm
      else -> firstOdometerCm
    },
    lastOdometerCm = when {
      lastOdometerCm == null -> next.lastOdometerCm
      next.lastOdometerCm == null -> lastOdometerCm
      next.lastSampleAtMs >= lastSampleAtMs -> next.lastOdometerCm
      else -> lastOdometerCm
    },
    gpsPointCount = gpsPointCount + next.gpsPointCount,
    preciseGpsPointCount = preciseGpsPointCount + next.preciseGpsPointCount,
    gpsDistanceCm = gpsDistanceCm + next.gpsDistanceCm,
    maxGpsSpeedCentiMps = when {
      maxGpsSpeedCentiMps == null -> next.maxGpsSpeedCentiMps
      next.maxGpsSpeedCentiMps == null -> maxGpsSpeedCentiMps
      else -> maxOf(maxGpsSpeedCentiMps, next.maxGpsSpeedCentiMps)
    },
  )
}
