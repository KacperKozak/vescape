package expo.modules.vescble.telemetry

import android.content.Context
import android.os.SystemClock
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

private const val TAG = "TelemetryStore"
private const val KEYFRAME_INTERVAL_MS = 60_000L
private const val GAP_BOUNDARY_MS = 90_000L
private const val FLUSH_FRAME_COUNT = 25
private const val FLUSH_DELAY_MS = 5_000L
private const val MAX_PENDING_FRAMES = 1_000
private const val DEFAULT_HISTORY_LIMIT = 100
private const val DEFAULT_SAMPLE_LIMIT = 2_000

data class TelemetryLocationCapture(
  val latitude: Double,
  val longitude: Double,
  val speedMps: Double?,
  val bearingDeg: Double?,
  val accuracyM: Double?,
  val altitudeM: Double?,
  val timestamp: Long,
  val precise: Boolean,
)

data class TelemetryCapture(
  val capturedAtMs: Long,
  val elapsedRealtimeMs: Long,
  val deviceId: String?,
  val deviceName: String,
  val canId: Int?,
  val hasFault: Boolean,
  val faultCode: Int,
  val pitch: Double,
  val roll: Double,
  val balancePitch: Double,
  val balanceCurrent: Double,
  val speed: Double,
  val batteryVoltage: Double,
  val motorCurrent: Double,
  val batteryCurrent: Double,
  val erpm: Int,
  val dutyCycle: Double,
  val state: Int,
  val switchState: Int,
  val adc1: Double,
  val adc2: Double,
  val odometer: Double?,
  val tempMosfet: Double?,
  val tempMotor: Double?,
  val avgLatency: Int?,
  val location: TelemetryLocationCapture?,
)

class TelemetryRepository private constructor(context: Context) {
  private val db = TelemetryDatabase.get(context)
  private val dao = db.telemetryDao()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val lock = Any()
  private val pending = ArrayDeque<PendingFrame>()
  private val pendingLocations = ArrayDeque<PendingLocation>()
  private val pendingMarkers = ArrayDeque<TelemetryMarkerEntity>()
  private val lastLocationByDevice = mutableMapOf<String, LocationState>()

  private var flushScheduled = false
  private var lastState: FullTelemetryState? = null
  private var lastFrameAtMs: Long? = null
  private var lastHistoryAtMs: Long? = null
  private var lastKeyframeAtMs: Long? = null
  private var forceNextKeyframe = true
  private var droppedPendingFrames = 0L

  fun recordMarker(
    type: String,
    deviceId: String?,
    deviceName: String?,
    message: String? = null,
    gapMs: Long? = null,
  ) {
    val marker = TelemetryMarkerEntity(
      occurredAtMs = System.currentTimeMillis(),
      elapsedRealtimeMs = SystemClock.elapsedRealtime(),
      type = type,
      deviceId = deviceId,
      deviceName = deviceName,
      message = message,
      gapMs = gapMs,
    )
    synchronized(lock) {
      pendingMarkers.addLast(marker)
      scheduleFlushLocked()
    }
  }

  fun recordTelemetry(capture: TelemetryCapture) {
    val current = FullTelemetryState.from(capture)
    val frame: TelemetryFrameEntity
    val gapMarker: TelemetryMarkerEntity?
    synchronized(lock) {
      val previous = lastState
      val gapMs = lastHistoryAtMs?.let { capture.capturedAtMs - it }
      val gap = gapMs != null && gapMs > GAP_BOUNDARY_MS
      val keyframe = forceNextKeyframe ||
        previous == null ||
        gap ||
        lastKeyframeAtMs == null ||
        capture.capturedAtMs - (lastKeyframeAtMs ?: 0L) >= KEYFRAME_INTERVAL_MS

      frame = current.toFrame(previous, keyframe)
      gapMarker = if (gap) {
        TelemetryMarkerEntity(
          occurredAtMs = capture.capturedAtMs,
          elapsedRealtimeMs = capture.elapsedRealtimeMs,
          type = "gap",
          deviceId = capture.deviceId,
          deviceName = capture.deviceName,
          message = null,
          gapMs = gapMs,
        )
      } else {
        null
      }

      pending.addLast(PendingFrame(frame, current))
      if (gapMarker != null) pendingMarkers.addLast(gapMarker)
      while (pending.size + pendingLocations.size > MAX_PENDING_FRAMES) {
        if (pending.isNotEmpty()) {
          pending.removeFirst()
        } else {
          pendingLocations.removeFirst()
        }
        droppedPendingFrames++
        forceNextKeyframe = true
      }
      lastState = current
      lastFrameAtMs = capture.capturedAtMs
      lastHistoryAtMs = capture.capturedAtMs
      if (keyframe) {
        lastKeyframeAtMs = capture.capturedAtMs
        forceNextKeyframe = false
      }
      if (pending.size + pendingLocations.size >= FLUSH_FRAME_COUNT) {
        flushScheduled = false
        scope.launch { flushNow() }
      } else {
        scheduleFlushLocked()
      }
    }
  }

  fun recordLocation(
    location: TelemetryLocationCapture,
    deviceId: String? = null,
    deviceName: String? = null,
  ): Boolean {
    val state = LocationState.from(location, deviceId, deviceName)
    synchronized(lock) {
      val key = deviceId ?: UNKNOWN_TELEMETRY_DEVICE_ID
      val previous = lastLocationByDevice[key]
      if (previous != null &&
        previous.locationTimestampMs == state.locationTimestampMs &&
        previous.latitudeE7 == state.latitudeE7 &&
        previous.longitudeE7 == state.longitudeE7
      ) {
        return false
      }
      val gapMs = lastHistoryAtMs?.let { state.capturedAtMs - it }
      if (gapMs != null && gapMs > GAP_BOUNDARY_MS) {
        pendingMarkers.addLast(
          TelemetryMarkerEntity(
            occurredAtMs = state.capturedAtMs,
            elapsedRealtimeMs = state.elapsedRealtimeMs,
            type = "gap",
            deviceId = deviceId,
            deviceName = deviceName,
            message = null,
            gapMs = gapMs,
          ),
        )
      }
      val distanceCm = previous
        ?.takeIf { it.precise && state.precise && state.capturedAtMs >= it.capturedAtMs }
        ?.let { distanceCm(it, state) }
      val next = state.copy(distanceFromPreviousCm = distanceCm)
      pendingLocations.addLast(PendingLocation(next.toEntity(), next))
      while (pending.size + pendingLocations.size > MAX_PENDING_FRAMES) {
        if (pending.isNotEmpty()) {
          pending.removeFirst()
        } else {
          pendingLocations.removeFirst()
        }
        droppedPendingFrames++
        forceNextKeyframe = true
      }
      lastLocationByDevice[key] = next
      lastHistoryAtMs = state.capturedAtMs
      if (pending.size + pendingLocations.size >= FLUSH_FRAME_COUNT) {
        flushScheduled = false
        scope.launch { flushNow() }
      } else {
        scheduleFlushLocked()
      }
    }
    return true
  }

  fun flushBlocking() {
    runBlocking(Dispatchers.IO) {
      synchronized(lock) {
        forceNextKeyframe = true
      }
      flushNow()
    }
  }

  suspend fun getHistory(options: Map<String, Any?>): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    val now = System.currentTimeMillis()
    val fromMs = (options["fromMs"] as? Number)?.toLong() ?: 0L
    val toMs = (options["toMs"] as? Number)?.toLong() ?: now
    val beforeMs = (options["cursorBeforeMs"] as? Number)?.toLong() ?: toMs
    val limit = ((options["limit"] as? Number)?.toInt() ?: DEFAULT_HISTORY_LIMIT).coerceIn(1, 500)
    val deviceId = options["deviceId"] as? String

    val buckets = dao.getHistoryBuckets(fromMs, toMs, beforeMs, deviceId, limit)
    if (buckets.isEmpty()) return@withContext emptyList()
    val markerFrom = buckets.minOf { it.bucketStartMs } - GAP_BOUNDARY_MS
    val markerTo = buckets.maxOf { it.bucketStartMs } + TELEMETRY_BUCKET_SIZE_MS
    val markers = dao.getMarkers(markerFrom, markerTo, deviceId)
    buckets.map { bucket ->
      val marker = markers.lastOrNull {
        it.occurredAtMs >= bucket.firstSampleAtMs - 5_000L &&
          it.occurredAtMs <= bucket.firstSampleAtMs + 1_000L
      }
      val avgAbsSpeed = if (bucket.sampleCount > 0) {
        bucket.sumAbsSpeedCentiKmh.toDouble() / bucket.sampleCount / 100.0
      } else {
        0.0
      }
      val maxGpsSpeedKmh = bucket.maxGpsSpeedCentiMps?.let { it / 100.0 * 3.6 }
      val distanceM = distanceDeltaM(bucket) ?: bucket.gpsDistanceCm.takeIf { it > 0L }?.let { it / 100.0 }
      mapOf(
        "id" to "${bucket.deviceId}:${bucket.bucketStartMs}",
        "startAtMs" to bucket.firstSampleAtMs,
        "endAtMs" to bucket.lastSampleAtMs,
        "bucketStartMs" to bucket.bucketStartMs,
        "deviceId" to bucket.deviceId.ifBlank { null },
        "deviceName" to (bucket.deviceName ?: UNKNOWN_TELEMETRY_DEVICE_NAME),
        "sampleCount" to bucket.sampleCount,
        "gpsPointCount" to bucket.gpsPointCount,
        "preciseGpsPointCount" to bucket.preciseGpsPointCount,
        "maxAbsSpeedKmh" to bucket.maxAbsSpeedCentiKmh / 100.0,
        "maxGpsSpeedKmh" to maxGpsSpeedKmh,
        "avgAbsSpeedKmh" to avgAbsSpeed,
        "minBatteryVoltage" to bucket.minBatteryVoltageMv?.let { it / 1000.0 },
        "maxMotorCurrent" to bucket.maxMotorCurrentAbsMa / 1000.0,
        "maxBatteryCurrent" to bucket.maxBatteryCurrentAbsMa / 1000.0,
        "maxDuty" to bucket.maxDutyAbsPermille / 1000.0,
        "faultCount" to bucket.faultCount,
        "distanceDeltaM" to distanceM,
        "gpsDistanceM" to bucket.gpsDistanceCm.takeIf { it > 0L }?.let { it / 100.0 },
        "boundaryBefore" to (marker?.type ?: "none"),
        "boundaryMessage" to marker?.message,
        "gapBeforeMs" to marker?.gapMs,
      )
    }
  }

  suspend fun getSamples(options: Map<String, Any?>): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    val fromMs = (options["fromMs"] as? Number)?.toLong()
      ?: throw IllegalArgumentException("fromMs is required")
    val toMs = (options["toMs"] as? Number)?.toLong()
      ?: throw IllegalArgumentException("toMs is required")
    val deviceId = options["deviceId"] as? String
    val limit = ((options["limit"] as? Number)?.toInt() ?: DEFAULT_SAMPLE_LIMIT).coerceIn(1, 10_000)

    val keyframe = dao.getLatestKeyframeBefore(fromMs, deviceId)
    val start = keyframe?.capturedAtMs ?: fromMs
    val frames = dao.getFrames(start, toMs, deviceId, limit + 1)
    var state: FullTelemetryState? = null
    val samples = mutableListOf<Map<String, Any?>>()
    for (frame in frames) {
      state = FullTelemetryState.applyFrame(state, frame)
      val current = state ?: continue
      if (frame.capturedAtMs < fromMs) continue
      samples.add(current.toSampleMap(frame.id))
      if (samples.size >= limit) break
    }
    samples
  }

  suspend fun getRange(options: Map<String, Any?>): Map<String, Any?> = withContext(Dispatchers.IO) {
    val fromMs = (options["fromMs"] as? Number)?.toLong()
      ?: throw IllegalArgumentException("fromMs is required")
    val toMs = (options["toMs"] as? Number)?.toLong()
      ?: throw IllegalArgumentException("toMs is required")
    val deviceId = options["deviceId"] as? String
    val limit = ((options["limit"] as? Number)?.toInt() ?: DEFAULT_SAMPLE_LIMIT).coerceIn(1, 10_000)
    mapOf(
      "boardSamples" to getSamples(options),
      "gpsSamples" to dao.getLocations(fromMs, toMs, deviceId, limit).map { it.toMap() },
      "markers" to dao.getMarkers(fromMs, toMs, deviceId).map { it.toMap() },
    )
  }

  suspend fun getSummary(): Map<String, Any?> = withContext(Dispatchers.IO) {
    mapOf(
      "sampleCount" to dao.countFrames(),
      "gpsPointCount" to dao.countLocations(),
      "firstAtMs" to listOfNotNull(dao.firstFrameAt(), dao.firstLocationAt()).minOrNull(),
      "lastAtMs" to listOfNotNull(dao.lastFrameAt(), dao.lastLocationAt()).maxOrNull(),
      "droppedPendingSamples" to synchronized(lock) { droppedPendingFrames },
    )
  }

  suspend fun deleteBefore(beforeMs: Long): Int = withContext(Dispatchers.IO) {
    dao.deleteBefore(beforeMs)
  }

  suspend fun deleteRange(options: Map<String, Any?>): Int = withContext(Dispatchers.IO) {
    val fromMs = (options["fromMs"] as? Number)?.toLong()
      ?: throw IllegalArgumentException("fromMs is required")
    val toMs = (options["toMs"] as? Number)?.toLong()
      ?: throw IllegalArgumentException("toMs is required")
    require(toMs >= fromMs) { "toMs must be greater than or equal to fromMs" }
    val deviceId = options["deviceId"] as? String
    flushNow()
    dao.deleteRange(fromMs, toMs, deviceId)
  }

  suspend fun clearAll() = withContext(Dispatchers.IO) {
    dao.clearAll()
    synchronized(lock) {
      pending.clear()
      pendingLocations.clear()
      pendingMarkers.clear()
      lastState = null
      lastFrameAtMs = null
      lastHistoryAtMs = null
      lastKeyframeAtMs = null
      lastLocationByDevice.clear()
      forceNextKeyframe = true
    }
  }

  private fun scheduleFlushLocked() {
    if (flushScheduled) return
    flushScheduled = true
    scope.launch {
      delay(FLUSH_DELAY_MS)
      flushNow()
    }
  }

  private suspend fun flushNow() {
    val frames: List<PendingFrame>
    val locations: List<PendingLocation>
    val markers: List<TelemetryMarkerEntity>
    synchronized(lock) {
      if (pending.isEmpty() && pendingLocations.isEmpty() && pendingMarkers.isEmpty()) {
        flushScheduled = false
        return
      }
      frames = pending.toList()
      locations = pendingLocations.toList()
      markers = pendingMarkers.toList()
      pending.clear()
      pendingLocations.clear()
      pendingMarkers.clear()
      flushScheduled = false
    }

    try {
      dao.insertBatch(
        frames = frames.map { it.frame },
        locations = locations.map { it.location },
        buckets = buildTelemetryBuckets(
          telemetryPoints = frames.map { it.state.toBucketPoint() },
          locationPoints = locations.map { it.state.toBucketPoint() },
        ),
        markers = markers,
      )
    } catch (e: Exception) {
      Log.w(TAG, "Telemetry flush failed: ${e.message}")
    }
  }

  companion object {
    @Volatile
    private var instance: TelemetryRepository? = null

    fun get(context: Context): TelemetryRepository {
      return instance ?: synchronized(this) {
        instance ?: TelemetryRepository(context.applicationContext).also { instance = it }
      }
    }
  }
}

private data class PendingFrame(
  val frame: TelemetryFrameEntity,
  val state: FullTelemetryState,
)

private data class PendingLocation(
  val location: HistoryLocationEntity,
  val state: LocationState,
)

private data class LocationState(
  val capturedAtMs: Long,
  val elapsedRealtimeMs: Long,
  val deviceId: String?,
  val deviceName: String?,
  val latitudeE7: Int,
  val longitudeE7: Int,
  val gpsSpeedCentiMps: Int?,
  val bearingCentiDeg: Int?,
  val accuracyCm: Int?,
  val altitudeCm: Int?,
  val locationTimestampMs: Long,
  val precise: Boolean,
  val distanceFromPreviousCm: Long?,
) {
  fun toEntity(): HistoryLocationEntity = HistoryLocationEntity(
    capturedAtMs = capturedAtMs,
    elapsedRealtimeMs = elapsedRealtimeMs,
    deviceId = deviceId,
    deviceName = deviceName,
    latitudeE7 = latitudeE7,
    longitudeE7 = longitudeE7,
    gpsSpeedCentiMps = gpsSpeedCentiMps,
    bearingCentiDeg = bearingCentiDeg,
    accuracyCm = accuracyCm,
    altitudeCm = altitudeCm,
    locationTimestampMs = locationTimestampMs,
    precise = precise,
    distanceFromPreviousCm = distanceFromPreviousCm,
  )

  fun toBucketPoint(): BucketLocationPoint = BucketLocationPoint(
    capturedAtMs = capturedAtMs,
    deviceId = deviceId,
    deviceName = deviceName,
    precise = precise,
    distanceFromPreviousCm = distanceFromPreviousCm,
    gpsSpeedCentiMps = gpsSpeedCentiMps,
  )

  companion object {
    fun from(location: TelemetryLocationCapture, deviceId: String?, deviceName: String?): LocationState =
      LocationState(
        capturedAtMs = System.currentTimeMillis(),
        elapsedRealtimeMs = SystemClock.elapsedRealtime(),
        deviceId = deviceId,
        deviceName = deviceName,
        latitudeE7 = (location.latitude * 10_000_000.0).roundToInt(),
        longitudeE7 = (location.longitude * 10_000_000.0).roundToInt(),
        gpsSpeedCentiMps = location.speedMps?.let { (it * 100.0).roundToInt() },
        bearingCentiDeg = location.bearingDeg?.let { (it * 100.0).roundToInt() },
        accuracyCm = location.accuracyM?.let { (it * 100.0).roundToInt() },
        altitudeCm = location.altitudeM?.let { (it * 100.0).roundToInt() },
        locationTimestampMs = location.timestamp,
        precise = location.precise,
        distanceFromPreviousCm = null,
      )
  }
}

private data class FullTelemetryState(
  val capturedAtMs: Long,
  val elapsedRealtimeMs: Long,
  val deviceId: String?,
  val deviceName: String?,
  val canId: Int?,
  val hasFault: Boolean,
  val faultCode: Int,
  val speedCentiKmh: Int,
  val batteryVoltageMv: Int,
  val motorCurrentMa: Int,
  val batteryCurrentMa: Int,
  val dutyPermille: Int,
  val pitchCentiDeg: Int,
  val rollCentiDeg: Int,
  val balancePitchCentiDeg: Int,
  val balanceCurrentMa: Int,
  val erpm: Int,
  val state: Int,
  val switchState: Int,
  val adc1Milli: Int,
  val adc2Milli: Int,
  val odometerCm: Long?,
  val tempMosfetDeciC: Int?,
  val tempMotorDeciC: Int?,
  val location: ScaledLocation?,
) {
  fun toFrame(previous: FullTelemetryState?, keyframe: Boolean): TelemetryFrameEntity {
    var mask1 = 0
    var mask2 = 0
    fun include(changed: Boolean, mask: Int): Boolean {
      if (keyframe || changed) {
        mask1 = mask1 or mask
        return true
      }
      return false
    }
    val includeLocation = keyframe || locationChanged(previous?.location, location)
    if (includeLocation) mask2 = mask2 or TELEMETRY_MASK2_LOCATION
    val flags = (if (keyframe) TELEMETRY_FLAG_KEYFRAME else 0) or
      (if (hasFault) TELEMETRY_FLAG_HAS_FAULT else 0) or
      (if (location != null) TELEMETRY_FLAG_HAS_LOCATION else 0)

    return TelemetryFrameEntity(
      capturedAtMs = capturedAtMs,
      elapsedRealtimeMs = elapsedRealtimeMs,
      deviceId = deviceId,
      deviceName = deviceName,
      canId = canId,
      flags = flags,
      changedMask1 = 0,
      changedMask2 = 0,
      speedCentiKmh = if (include(changedBy(previous?.speedCentiKmh, speedCentiKmh, 5), TELEMETRY_MASK_SPEED)) speedCentiKmh else null,
      batteryVoltageMv = if (include(changedBy(previous?.batteryVoltageMv, batteryVoltageMv, 20), TELEMETRY_MASK_BATTERY_VOLTAGE)) batteryVoltageMv else null,
      motorCurrentMa = if (include(changedBy(previous?.motorCurrentMa, motorCurrentMa, 100), TELEMETRY_MASK_MOTOR_CURRENT)) motorCurrentMa else null,
      batteryCurrentMa = if (include(changedBy(previous?.batteryCurrentMa, batteryCurrentMa, 100), TELEMETRY_MASK_BATTERY_CURRENT)) batteryCurrentMa else null,
      dutyPermille = if (include(changedBy(previous?.dutyPermille, dutyPermille, 2), TELEMETRY_MASK_DUTY)) dutyPermille else null,
      pitchCentiDeg = if (include(changedBy(previous?.pitchCentiDeg, pitchCentiDeg, 5), TELEMETRY_MASK_PITCH)) pitchCentiDeg else null,
      rollCentiDeg = if (include(changedBy(previous?.rollCentiDeg, rollCentiDeg, 5), TELEMETRY_MASK_ROLL)) rollCentiDeg else null,
      balancePitchCentiDeg = if (include(changedBy(previous?.balancePitchCentiDeg, balancePitchCentiDeg, 5), TELEMETRY_MASK_BALANCE_PITCH)) balancePitchCentiDeg else null,
      balanceCurrentMa = if (include(changedBy(previous?.balanceCurrentMa, balanceCurrentMa, 100), TELEMETRY_MASK_BALANCE_CURRENT)) balanceCurrentMa else null,
      erpm = if (include(previous?.erpm != erpm, TELEMETRY_MASK_ERPM)) erpm else null,
      state = if (include(previous?.state != state, TELEMETRY_MASK_STATE)) state else null,
      switchState = if (include(previous?.switchState != switchState, TELEMETRY_MASK_SWITCH_STATE)) switchState else null,
      adc1Milli = if (include(changedBy(previous?.adc1Milli, adc1Milli, 10), TELEMETRY_MASK_ADC1)) adc1Milli else null,
      adc2Milli = if (include(changedBy(previous?.adc2Milli, adc2Milli, 10), TELEMETRY_MASK_ADC2)) adc2Milli else null,
      odometerCm = if (include(changedBy(previous?.odometerCm, odometerCm, 25), TELEMETRY_MASK_ODOMETER)) odometerCm else null,
      tempMosfetDeciC = if (include(changedBy(previous?.tempMosfetDeciC, tempMosfetDeciC, 5), TELEMETRY_MASK_TEMP_MOSFET)) tempMosfetDeciC else null,
      tempMotorDeciC = if (include(changedBy(previous?.tempMotorDeciC, tempMotorDeciC, 5), TELEMETRY_MASK_TEMP_MOTOR)) tempMotorDeciC else null,
      faultCode = if (include(previous?.faultCode != faultCode, TELEMETRY_MASK_FAULT_CODE)) faultCode else null,
      latitudeE7 = if (includeLocation) location?.latitudeE7 else null,
      longitudeE7 = if (includeLocation) location?.longitudeE7 else null,
      gpsSpeedCentiMps = if (includeLocation) location?.gpsSpeedCentiMps else null,
      bearingCentiDeg = if (includeLocation) location?.bearingCentiDeg else null,
      accuracyCm = if (includeLocation) location?.accuracyCm else null,
      altitudeCm = if (includeLocation) location?.altitudeCm else null,
      locationTimestampMs = if (includeLocation) location?.timestampMs else null,
    ).copy(changedMask1 = mask1, changedMask2 = mask2)
  }

  fun toSampleMap(id: Long): Map<String, Any?> = mapOf(
    "id" to id,
    "capturedAtMs" to capturedAtMs,
    "deviceId" to deviceId,
    "deviceName" to (deviceName ?: UNKNOWN_TELEMETRY_DEVICE_NAME),
    "speedKmh" to speedCentiKmh / 100.0,
    "batteryVoltage" to batteryVoltageMv / 1000.0,
    "motorCurrent" to motorCurrentMa / 1000.0,
    "batteryCurrent" to batteryCurrentMa / 1000.0,
    "dutyCycle" to dutyPermille / 1000.0,
    "pitch" to pitchCentiDeg / 100.0,
    "roll" to rollCentiDeg / 100.0,
    "balancePitch" to balancePitchCentiDeg / 100.0,
    "balanceCurrent" to balanceCurrentMa / 1000.0,
    "erpm" to erpm,
    "state" to state,
    "switchState" to switchState,
    "adc1" to adc1Milli / 1000.0,
    "adc2" to adc2Milli / 1000.0,
    "odometer" to odometerCm?.let { it / 100.0 },
    "tempMosfet" to tempMosfetDeciC?.let { it / 10.0 },
    "tempMotor" to tempMotorDeciC?.let { it / 10.0 },
    "hasFault" to hasFault,
    "faultCode" to faultCode,
    "latitude" to location?.latitudeE7?.let { it / 10_000_000.0 },
    "longitude" to location?.longitudeE7?.let { it / 10_000_000.0 },
  )

  fun toBucketPoint(): BucketTelemetryPoint = BucketTelemetryPoint(
    capturedAtMs = capturedAtMs,
    deviceId = deviceId,
    deviceName = deviceName,
    speedCentiKmh = speedCentiKmh,
    batteryVoltageMv = batteryVoltageMv,
    motorCurrentMa = motorCurrentMa,
    batteryCurrentMa = batteryCurrentMa,
    dutyPermille = dutyPermille,
    hasFault = hasFault,
    odometerCm = odometerCm,
  )

  companion object {
    fun from(capture: TelemetryCapture): FullTelemetryState = FullTelemetryState(
      capturedAtMs = capture.capturedAtMs,
      elapsedRealtimeMs = capture.elapsedRealtimeMs,
      deviceId = capture.deviceId,
      deviceName = capture.deviceName,
      canId = capture.canId,
      hasFault = capture.hasFault,
      faultCode = capture.faultCode,
      speedCentiKmh = (capture.speed * 100.0).roundToInt(),
      batteryVoltageMv = (capture.batteryVoltage * 1000.0).roundToInt(),
      motorCurrentMa = (capture.motorCurrent * 1000.0).roundToInt(),
      batteryCurrentMa = (capture.batteryCurrent * 1000.0).roundToInt(),
      dutyPermille = (capture.dutyCycle * 1000.0).roundToInt(),
      pitchCentiDeg = (capture.pitch * 100.0).roundToInt(),
      rollCentiDeg = (capture.roll * 100.0).roundToInt(),
      balancePitchCentiDeg = (capture.balancePitch * 100.0).roundToInt(),
      balanceCurrentMa = (capture.balanceCurrent * 1000.0).roundToInt(),
      erpm = capture.erpm,
      state = capture.state,
      switchState = capture.switchState,
      adc1Milli = (capture.adc1 * 1000.0).roundToInt(),
      adc2Milli = (capture.adc2 * 1000.0).roundToInt(),
      odometerCm = capture.odometer?.let { (it * 100.0).roundToLong() },
      tempMosfetDeciC = capture.tempMosfet?.let { (it * 10.0).roundToInt() },
      tempMotorDeciC = capture.tempMotor?.let { (it * 10.0).roundToInt() },
      location = capture.location?.let { ScaledLocation.from(it) },
    )

    fun applyFrame(previous: FullTelemetryState?, frame: TelemetryFrameEntity): FullTelemetryState? {
      val base = previous
      fun <T> pick(value: T?, fallback: T?): T? = value ?: fallback
      val speed = pick(frame.speedCentiKmh, base?.speedCentiKmh) ?: return null
      val voltage = pick(frame.batteryVoltageMv, base?.batteryVoltageMv) ?: return null
      val motorCurrent = pick(frame.motorCurrentMa, base?.motorCurrentMa) ?: return null
      val batteryCurrent = pick(frame.batteryCurrentMa, base?.batteryCurrentMa) ?: return null
      val duty = pick(frame.dutyPermille, base?.dutyPermille) ?: return null
      val pitch = pick(frame.pitchCentiDeg, base?.pitchCentiDeg) ?: return null
      val roll = pick(frame.rollCentiDeg, base?.rollCentiDeg) ?: return null
      val balancePitch = pick(frame.balancePitchCentiDeg, base?.balancePitchCentiDeg) ?: return null
      val balanceCurrent = pick(frame.balanceCurrentMa, base?.balanceCurrentMa) ?: return null
      val erpm = pick(frame.erpm, base?.erpm) ?: return null
      val state = pick(frame.state, base?.state) ?: return null
      val switchState = pick(frame.switchState, base?.switchState) ?: return null
      val adc1 = pick(frame.adc1Milli, base?.adc1Milli) ?: return null
      val adc2 = pick(frame.adc2Milli, base?.adc2Milli) ?: return null
      val faultCode = pick(frame.faultCode, base?.faultCode) ?: 0
      val location = if ((frame.changedMask2 and TELEMETRY_MASK2_LOCATION) != 0) {
        ScaledLocation.fromFrame(frame)
      } else {
        base?.location
      }
      return FullTelemetryState(
        capturedAtMs = frame.capturedAtMs,
        elapsedRealtimeMs = frame.elapsedRealtimeMs,
        deviceId = frame.deviceId ?: base?.deviceId,
        deviceName = frame.deviceName ?: base?.deviceName,
        canId = frame.canId ?: base?.canId,
        hasFault = (frame.flags and TELEMETRY_FLAG_HAS_FAULT) != 0,
        faultCode = faultCode,
        speedCentiKmh = speed,
        batteryVoltageMv = voltage,
        motorCurrentMa = motorCurrent,
        batteryCurrentMa = batteryCurrent,
        dutyPermille = duty,
        pitchCentiDeg = pitch,
        rollCentiDeg = roll,
        balancePitchCentiDeg = balancePitch,
        balanceCurrentMa = balanceCurrent,
        erpm = erpm,
        state = state,
        switchState = switchState,
        adc1Milli = adc1,
        adc2Milli = adc2,
        odometerCm = pick(frame.odometerCm, base?.odometerCm),
        tempMosfetDeciC = pick(frame.tempMosfetDeciC, base?.tempMosfetDeciC),
        tempMotorDeciC = pick(frame.tempMotorDeciC, base?.tempMotorDeciC),
        location = location,
      )
    }
  }
}

private data class ScaledLocation(
  val latitudeE7: Int,
  val longitudeE7: Int,
  val gpsSpeedCentiMps: Int?,
  val bearingCentiDeg: Int?,
  val accuracyCm: Int?,
  val altitudeCm: Int?,
  val timestampMs: Long,
) {
  companion object {
    fun from(location: TelemetryLocationCapture): ScaledLocation = ScaledLocation(
      latitudeE7 = (location.latitude * 10_000_000.0).roundToInt(),
      longitudeE7 = (location.longitude * 10_000_000.0).roundToInt(),
      gpsSpeedCentiMps = location.speedMps?.let { (it * 100.0).roundToInt() },
      bearingCentiDeg = location.bearingDeg?.let { (it * 100.0).roundToInt() },
      accuracyCm = location.accuracyM?.let { (it * 100.0).roundToInt() },
      altitudeCm = location.altitudeM?.let { (it * 100.0).roundToInt() },
      timestampMs = location.timestamp,
    )

    fun fromFrame(frame: TelemetryFrameEntity): ScaledLocation? {
      val lat = frame.latitudeE7 ?: return null
      val lon = frame.longitudeE7 ?: return null
      return ScaledLocation(
        latitudeE7 = lat,
        longitudeE7 = lon,
        gpsSpeedCentiMps = frame.gpsSpeedCentiMps,
        bearingCentiDeg = frame.bearingCentiDeg,
        accuracyCm = frame.accuracyCm,
        altitudeCm = frame.altitudeCm,
        timestampMs = frame.locationTimestampMs ?: frame.capturedAtMs,
      )
    }
  }
}

private fun changedBy(previous: Int?, current: Int, threshold: Int): Boolean =
  previous == null || abs(current - previous) >= threshold

private fun changedBy(previous: Long?, current: Long?, threshold: Long): Boolean =
  previous != current && (previous == null || current == null || abs(current - previous) >= threshold)

private fun changedBy(previous: Int?, current: Int?, threshold: Int): Boolean =
  previous != current && (previous == null || current == null || abs(current - previous) >= threshold)

private fun locationChanged(previous: ScaledLocation?, current: ScaledLocation?): Boolean {
  if (previous == null || current == null) return previous != current
  val latMeters = (current.latitudeE7 - previous.latitudeE7) * 0.0111
  val lonMeters = (current.longitudeE7 - previous.longitudeE7) * 0.0111
  val distanceChanged = abs(latMeters) > 2.0 || abs(lonMeters) > 2.0
  val accuracyChanged = changedBy(previous.accuracyCm, current.accuracyCm, 200)
  val timeChanged = current.timestampMs - previous.timestampMs > 5_000L
  return distanceChanged || accuracyChanged || timeChanged
}

private fun distanceDeltaM(bucket: TelemetryMinuteBucketEntity): Double? {
  val first = bucket.firstOdometerCm ?: return null
  val last = bucket.lastOdometerCm ?: return null
  return ((last - first).coerceAtLeast(0L)) / 100.0
}

private fun HistoryLocationEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "capturedAtMs" to capturedAtMs,
  "deviceId" to deviceId,
  "deviceName" to (deviceName ?: UNKNOWN_TELEMETRY_DEVICE_NAME),
  "latitude" to latitudeE7 / 10_000_000.0,
  "longitude" to longitudeE7 / 10_000_000.0,
  "speedMps" to gpsSpeedCentiMps?.let { it / 100.0 },
  "bearingDeg" to bearingCentiDeg?.let { it / 100.0 },
  "accuracyM" to accuracyCm?.let { it / 100.0 },
  "altitudeM" to altitudeCm?.let { it / 100.0 },
  "timestamp" to locationTimestampMs,
  "precise" to precise,
  "distanceFromPreviousM" to distanceFromPreviousCm?.let { it / 100.0 },
)

private fun TelemetryMarkerEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "occurredAtMs" to occurredAtMs,
  "type" to type,
  "deviceId" to deviceId,
  "deviceName" to deviceName,
  "message" to message,
  "gapMs" to gapMs,
)

private fun distanceCm(from: LocationState, to: LocationState): Long {
  val lat1 = Math.toRadians(from.latitudeE7 / 10_000_000.0)
  val lat2 = Math.toRadians(to.latitudeE7 / 10_000_000.0)
  val deltaLat = lat2 - lat1
  val deltaLon = Math.toRadians((to.longitudeE7 - from.longitudeE7) / 10_000_000.0)
  val a = sin(deltaLat / 2.0) * sin(deltaLat / 2.0) +
    cos(lat1) * cos(lat2) * sin(deltaLon / 2.0) * sin(deltaLon / 2.0)
  val c = 2.0 * atan2(sqrt(a), sqrt(1.0 - a))
  return (6_371_000.0 * c * 100.0).roundToLong()
}
