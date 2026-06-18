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
  suspend fun insertExclusionRange(exclusion: MetricExclusionRangeEntity): Long

  @Query(
    """
    SELECT * FROM metric_exclusion_ranges
    WHERE start_ms <= :toMs
      AND end_ms >= :fromMs
      AND (:deviceId IS NULL OR device_id = :deviceId)
    ORDER BY start_ms ASC
    """,
  )
  suspend fun getExclusions(fromMs: Long, toMs: Long, deviceId: String?): List<MetricExclusionRangeEntity>

  @Query("DELETE FROM metric_exclusion_ranges WHERE start_ms <= :toMs AND end_ms >= :fromMs")
  suspend fun deleteExclusionsRange(fromMs: Long, toMs: Long): Int

  @Query("DELETE FROM metric_exclusion_ranges")
  suspend fun clearExclusions()

  @Query("DELETE FROM metric_exclusion_ranges WHERE end_ms < :beforeMs")
  suspend fun deleteExclusionsBefore(beforeMs: Long): Int

  @Query(
    """
    SELECT * FROM metric_exclusion_ranges
    WHERE device_id = :deviceId
      AND reason = :reason
      AND end_ms >= :startMs - :mergeGapMs
    ORDER BY end_ms DESC
    LIMIT 1
    """,
  )
  suspend fun getMergeableExclusionRange(
    deviceId: String,
    reason: String,
    startMs: Long,
    mergeGapMs: Long,
  ): MetricExclusionRangeEntity?

  @Update
  suspend fun updateExclusionRange(exclusion: MetricExclusionRangeEntity)

  @Query("SELECT * FROM privacy_zones ORDER BY created_at ASC")
  suspend fun getPrivacyZones(): List<PrivacyZoneEntity>

  @Query("SELECT * FROM privacy_zones WHERE enabled = 1")
  suspend fun getEnabledPrivacyZones(): List<PrivacyZoneEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertPrivacyZone(zone: PrivacyZoneEntity)

  @Query("UPDATE privacy_zones SET enabled = :enabled, updated_at = :updatedAt WHERE id = :id")
  suspend fun setPrivacyZoneEnabled(id: String, enabled: Boolean, updatedAt: Long)

  @Query("DELETE FROM privacy_zones WHERE id = :id")
  suspend fun deletePrivacyZone(id: String)

  @Query("SELECT * FROM map_points ORDER BY created_at ASC")
  suspend fun getMapPoints(): List<MapPointEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertMapPoint(point: MapPointEntity)

  @Query("DELETE FROM map_points WHERE kind = 'direction'")
  suspend fun deleteDirectionMapPoints()

  @Transaction
  suspend fun replaceDirectionMapPoint(point: MapPointEntity) {
    deleteDirectionMapPoints()
    upsertMapPoint(point)
  }

  @Query("DELETE FROM map_points WHERE id = :id")
  suspend fun deleteMapPoint(id: String)

  @Insert
  suspend fun insertFrames(frames: List<TelemetryFrameEntity>): List<Long>

  @Insert
  suspend fun insertMarkers(markers: List<TelemetryMarkerEntity>)

  @Insert
  suspend fun insertDiagnosticEvent(event: DiagnosticEventEntity): Long

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
    buckets: Collection<TelemetryMinuteBucketEntity>,
    markers: List<TelemetryMarkerEntity>,
    exclusions: List<MetricExclusionRangeEntity> = emptyList(),
  ) {
    if (frames.isNotEmpty()) insertFrames(frames)
    if (buckets.isNotEmpty()) upsertBuckets(buckets)
    if (markers.isNotEmpty()) insertMarkers(markers)
    if (exclusions.isNotEmpty()) upsertExclusionRanges(exclusions)
  }

  @Transaction
  suspend fun upsertExclusionRanges(exclusions: List<MetricExclusionRangeEntity>) {
    for (exclusion in exclusions.sortedWith(compareBy({ it.deviceId }, { it.reason }, { it.startMs }))) {
      val existing = getMergeableExclusionRange(
        exclusion.deviceId,
        exclusion.reason,
        exclusion.startMs,
        METRIC_EXCLUSION_RANGE_MERGE_GAP_MS,
      )
      if (existing == null) {
        insertExclusionRange(exclusion)
      } else {
        updateExclusionRange(
          existing.copy(
            endMs = maxOf(existing.endMs, exclusion.endMs),
            sampleCount = existing.sampleCount + exclusion.sampleCount,
          ),
        )
      }
    }
  }

  @Query(
    """
    SELECT * FROM telemetry_minute_buckets
    WHERE (:deviceId IS NULL OR device_id = :deviceId)
      AND bucket_start_ms <= :beforeMs
      AND bucket_start_ms >= :fromMs
      AND bucket_start_ms <= :toMs
      AND sample_count > 0
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
    SELECT * FROM diagnostic_events
    WHERE occurred_at_ms >= :fromMs
      AND occurred_at_ms <= :toMs
      AND (:deviceId IS NULL OR device_id = :deviceId)
    ORDER BY occurred_at_ms DESC
    LIMIT :limit
    """,
  )
  suspend fun getDiagnosticEvents(
    fromMs: Long,
    toMs: Long,
    deviceId: String?,
    limit: Int,
  ): List<DiagnosticEventEntity>

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

  @Query("SELECT COUNT(*) FROM telemetry_frames")
  suspend fun countFrames(): Long

  @Query("SELECT COALESCE(SUM(gps_point_count), 0) FROM telemetry_minute_buckets WHERE sample_count > 0")
  suspend fun countTelemetryGpsPoints(): Long

  @Query("SELECT MIN(captured_at_ms) FROM telemetry_frames")
  suspend fun firstFrameAt(): Long?

  @Query("SELECT MAX(captured_at_ms) FROM telemetry_frames")
  suspend fun lastFrameAt(): Long?

  @Query("DELETE FROM telemetry_frames WHERE captured_at_ms < :beforeMs")
  suspend fun deleteFramesBefore(beforeMs: Long): Int

  @Query("DELETE FROM telemetry_markers WHERE occurred_at_ms < :beforeMs")
  suspend fun deleteMarkersBefore(beforeMs: Long): Int

  @Query("DELETE FROM telemetry_minute_buckets WHERE bucket_start_ms < :beforeMs")
  suspend fun deleteBucketsBefore(beforeMs: Long): Int

  @Query("DELETE FROM diagnostic_events WHERE occurred_at_ms < :beforeMs")
  suspend fun deleteDiagnosticEventsBefore(beforeMs: Long): Int

  @Transaction
  suspend fun deleteBefore(beforeMs: Long): Int {
    val frames = deleteFramesBefore(beforeMs)
    deleteMarkersBefore(beforeMs)
    deleteBucketsBefore(beforeMs)
    deleteDiagnosticEventsBefore(beforeMs)
    deleteExclusionsBefore(beforeMs)
    return frames
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
    deleteMarkersRange(fromMs, toMs, deviceId)
    deleteBucketsRange(fromMs, toMs, deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID)
    deleteExclusionsRange(fromMs, toMs)
    return frames
  }

  @Query("DELETE FROM telemetry_frames")
  suspend fun clearFrames()

  @Query("DELETE FROM telemetry_markers")
  suspend fun clearMarkers()

  @Query("DELETE FROM telemetry_minute_buckets")
  suspend fun clearBuckets()

  @Query("DELETE FROM diagnostic_events")
  suspend fun clearDiagnosticEvents()

  @Transaction
  suspend fun clearAll() {
    clearFrames()
    clearMarkers()
    clearBuckets()
    clearDiagnosticEvents()
    clearExclusions()
  }

  @Query("SELECT * FROM boards ORDER BY created_at ASC")
  suspend fun getBoards(): List<BoardEntity>

  @Query("SELECT * FROM boards WHERE id = :id LIMIT 1")
  suspend fun getBoard(id: String): BoardEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertBoard(board: BoardEntity)

  @Query("SELECT * FROM board_settings WHERE board_id = :boardId")
  suspend fun getBoardSettings(boardId: String): List<BoardSettingEntity>

  @Query("SELECT * FROM board_settings WHERE board_id IN (:boardIds)")
  suspend fun getBoardSettings(boardIds: List<String>): List<BoardSettingEntity>

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertBoardSetting(setting: BoardSettingEntity)

  @Query("DELETE FROM board_settings WHERE board_id = :boardId AND key = :key")
  suspend fun deleteBoardSetting(boardId: String, key: String)

  @Transaction
  suspend fun upsertBoardWithSettings(board: BoardEntity, settings: List<BoardSettingEntity>, deletedKeys: List<String>) {
    upsertBoard(board)
    deletedKeys.forEach { deleteBoardSetting(board.id, it) }
    settings.forEach { upsertBoardSetting(it) }
  }

  @Query("DELETE FROM board_settings WHERE board_id = :boardId")
  suspend fun deleteBoardSettings(boardId: String)

  @Query("DELETE FROM boards WHERE id = :id")
  suspend fun deleteBoard(id: String)

  @Transaction
  suspend fun deleteBoardWithSettings(id: String) {
    deleteBoardSettings(id)
    deleteBoard(id)
  }

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

  @Query("SELECT * FROM app_settings")
  suspend fun getAllAppSettings(): List<AppSettingEntity>

  @Query("SELECT * FROM app_settings WHERE key = :key LIMIT 1")
  suspend fun getAppSetting(key: String): AppSettingEntity?

  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun upsertAppSetting(setting: AppSettingEntity)

  @Query("DELETE FROM app_settings WHERE key = :key")
  suspend fun deleteAppSetting(key: String)

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
    movingSpeedSampleCount = mergeNullableSums(movingSpeedSampleCount, next.movingSpeedSampleCount),
    sumMovingAbsSpeedCentiKmh = mergeNullableSums(sumMovingAbsSpeedCentiKmh, next.sumMovingAbsSpeedCentiKmh),
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
    maxTempMosfetDeciC = when {
      maxTempMosfetDeciC == null -> next.maxTempMosfetDeciC
      next.maxTempMosfetDeciC == null -> maxTempMosfetDeciC
      else -> maxOf(maxTempMosfetDeciC, next.maxTempMosfetDeciC)
    },
    maxTempMotorDeciC = when {
      maxTempMotorDeciC == null -> next.maxTempMotorDeciC
      next.maxTempMotorDeciC == null -> maxTempMotorDeciC
      else -> maxOf(maxTempMotorDeciC, next.maxTempMotorDeciC)
    },
    firstLatitudeE7 = when {
      firstLatitudeE7 != null && next.firstSampleAtMs >= firstSampleAtMs -> firstLatitudeE7
      next.firstLatitudeE7 != null -> next.firstLatitudeE7
      else -> firstLatitudeE7
    },
    firstLongitudeE7 = when {
      firstLongitudeE7 != null && next.firstSampleAtMs >= firstSampleAtMs -> firstLongitudeE7
      next.firstLongitudeE7 != null -> next.firstLongitudeE7
      else -> firstLongitudeE7
    },
  )
}

private fun mergeNullableSums(a: Int?, b: Int?): Int? {
  if (a == null && b == null) return null
  return (a ?: 0) + (b ?: 0)
}

private fun mergeNullableSums(a: Long?, b: Long?): Long? {
  if (a == null && b == null) return null
  return (a ?: 0L) + (b ?: 0L)
}
