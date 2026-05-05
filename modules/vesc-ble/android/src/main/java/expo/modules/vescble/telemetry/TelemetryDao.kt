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
