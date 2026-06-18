package expo.modules.vescble.telemetry

import android.content.Context
import expo.modules.vescble.BoardTransport
import expo.modules.vescble.DiagnosticReporter
import expo.modules.vescble.RefloatConfigSnapshot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

internal fun validMapStyleKey(value: Any?): String? =
  (value as? String)?.takeIf { it in setOf("onedark", "outdoors", "satellite", "mapy") }

internal fun validMapNavigationMode(value: Any?): String? =
  (value as? String)?.takeIf { it in setOf("northUp", "gpsHeading", "phoneHeading", "freeRotate") }

internal fun validLiveHistoryLimitMinutes(value: Any?): Int? =
  (value as? Number)
    ?.toInt()
    ?.coerceIn(MIN_LIVE_HISTORY_LIMIT_MINUTES, MAX_LIVE_HISTORY_LIMIT_MINUTES)

val DEFAULT_HISTORY_METRIC_HOT_RANGES: Map<String, Map<String, Double>> = mapOf(
  "speed" to mapOf("start" to 30.0, "end" to 40.0),
  "duty" to mapOf("start" to 60.0, "end" to 80.0),
  "tempMotor" to mapOf("start" to 70.0, "end" to 90.0),
  "tempController" to mapOf("start" to 60.0, "end" to 80.0),
  "motorCurrent" to mapOf("start" to 35.0, "end" to 55.0),
  "batteryCurrent" to mapOf("start" to 25.0, "end" to 45.0),
)

private val historyMetricHotRangeKeys = setOf(
  "speed",
  "duty",
  "battery",
  "tempMotor",
  "tempController",
  "motorCurrent",
  "batteryCurrent",
)

private fun validHistoryMetricHotRanges(value: Any?): Map<String, Map<String, Double>>? {
  val entries: Sequence<Pair<String, Any?>> = when (value) {
    is JSONObject -> value.keys().asSequence().map { it to value.opt(it) }
    is Map<*, *> -> value.asSequence().mapNotNull { (key, range) ->
      (key as? String)?.let { it to range }
    }
    else -> return null
  }

  val ranges = mutableMapOf<String, Map<String, Double>>()
  for ((metric, rawRange) in entries) {
    if (metric !in historyMetricHotRangeKeys) continue
    val start: Double?
    val end: Double?
    when (rawRange) {
      is JSONObject -> {
        start = (rawRange.opt("start") as? Number)?.toDouble()
        end = (rawRange.opt("end") as? Number)?.toDouble()
      }
      is Map<*, *> -> {
        start = (rawRange["start"] as? Number)?.toDouble()
        end = (rawRange["end"] as? Number)?.toDouble()
      }
      else -> continue
    }
    if (start != null && end != null && start.isFinite() && end.isFinite() && start != end) {
      ranges[metric] = mapOf("start" to start, "end" to end)
    }
  }
  return ranges
}

class AppDataRepository private constructor(private val context: Context) {
  private val dao = TelemetryDatabase.get(context).telemetryDao()

  suspend fun getBoards(): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    val boards = dao.getBoards()
    val settingsByBoard =
      if (boards.isEmpty()) emptyMap() else dao.getBoardSettings(boards.map { it.id }).groupBy { it.boardId }
    boards.map { it.toMap(settingsByBoard[it.id].orEmpty()) }
  }

  suspend fun getBoard(id: String): Map<String, Any?>? = withContext(Dispatchers.IO) {
    dao.getBoard(id)?.toMap(dao.getBoardSettings(id))
  }

  suspend fun upsertBoard(board: Map<String, Any?>): Unit = withContext(Dispatchers.IO) {
    val boardId = board.getString("id")
    val (settings, deletedKeys) = board.toBoardSettingEntities(boardId)
    dao.upsertBoardWithSettings(board.toBoardEntity(), settings, deletedKeys)
  }

  suspend fun deleteBoard(id: String): Unit = withContext(Dispatchers.IO) {
    dao.deleteBoardWithSettings(id)
  }

  suspend fun getAlertRules(): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    dao.getAlertRules().map { it.toMap() }
  }

  suspend fun getEnabledAlertRuleEntities(): List<AlertRuleEntity> = withContext(Dispatchers.IO) {
    dao.getEnabledAlertRules()
  }

  suspend fun upsertAlertRule(rule: Map<String, Any?>): Unit = withContext(Dispatchers.IO) {
    dao.upsertAlertRule(rule.toAlertRuleEntity())
  }

  suspend fun setAlertRuleEnabled(id: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
    dao.setAlertRuleEnabled(id, enabled)
  }

  suspend fun deleteAlertRule(id: String): Unit = withContext(Dispatchers.IO) {
    dao.deleteAlertRule(id)
  }

  suspend fun getSettings(): Map<String, Any?> = withContext(Dispatchers.IO) {
    getTypedSettings().toMap()
  }

  suspend fun getTypedSettings(): AppSettings = withContext(Dispatchers.IO) {
    val rows = dao.getAllAppSettings()
    val map = rows.associateBy { it.key }
    val badKeys = mutableListOf<String>()

    fun <T : Any> req(key: String, default: T, coerce: (Any?) -> T?): T {
      val row = map[key] ?: return default
      return try {
        coerce(decodeSettingJson(row.valueJson)) ?: run { badKeys += key; default }
      } catch (_: Exception) { badKeys += key; default }
    }

    fun <T : Any> opt(key: String, coerce: (Any) -> T?): T? {
      val row = map[key] ?: return null
      return try {
        val raw = decodeSettingJson(row.valueJson) ?: return null
        coerce(raw) ?: run { badKeys += key; null }
      } catch (_: Exception) { badKeys += key; null }
    }

    val settings = AppSettings(
      liveHistoryLimit = req("liveHistoryLimit", 5, ::validLiveHistoryLimitMinutes),
      autoConnect = req("autoConnect", true) { it as? Boolean },
      autoRecording = req("autoRecording", false) { it as? Boolean },
      selectedBoardId = opt("selectedBoardId") { it as? String },
      lastGpsLatitude = opt("lastGpsLatitude") { (it as? Number)?.toDouble() },
      lastGpsLongitude = opt("lastGpsLongitude") { (it as? Number)?.toDouble() },
      movingSpeedThresholdKmh = req("movingSpeedThresholdKmh", 3.0) { (it as? Number)?.toDouble() },
      freeSpinMaxSpeedDeltaKmh = req("freeSpinMaxSpeedDeltaKmh", DEFAULT_FREE_SPIN_MAX_SPEED_DELTA_KMH) { (it as? Number)?.toDouble() },
      freeSpinStationaryBoardCapKmh = req("freeSpinStationaryBoardCapKmh", DEFAULT_FREE_SPIN_STATIONARY_BOARD_CAP_KMH) { (it as? Number)?.toDouble() },
      mapStyleKey = req("mapStyleKey", "onedark", ::validMapStyleKey),
      mapNavigationMode = req("mapNavigationMode", "northUp", ::validMapNavigationMode),
      historyMetricGradientsEnabled = req("historyMetricGradientsEnabled", true) { it as? Boolean },
      historyMetricHotRanges = req("historyMetricHotRanges", DEFAULT_HISTORY_METRIC_HOT_RANGES, ::validHistoryMetricHotRanges),
    )

    if (badKeys.isNotEmpty()) {
      for (key in badKeys) dao.deleteAppSetting(key)
      DiagnosticReporter.get(context).capture(
        "app_setting_corrupt",
        mapOf("keys" to badKeys.joinToString(",")),
      )
    }

    settings
  }

  suspend fun updateSetting(key: String, value: Any?): Unit = withContext(Dispatchers.IO) {
    val coerced: Any? = when (key) {
      "liveHistoryLimit" -> validLiveHistoryLimitMinutes(value) ?: return@withContext
      "autoConnect" -> value as? Boolean ?: return@withContext
      "autoRecording" -> value as? Boolean ?: return@withContext
      "selectedBoardId" -> value as? String
      "lastGpsLatitude" -> (value as? Number)?.toDouble()
      "lastGpsLongitude" -> (value as? Number)?.toDouble()
      "movingSpeedThresholdKmh", "avgSpeedCutoffKmh", "movingAvgSpeedThresholdKmh" ->
        ((value as? Number)?.toDouble() ?: return@withContext).coerceAtLeast(0.0)
      "freeSpinMaxSpeedDeltaKmh", "freeSpinStationaryBoardCapKmh" ->
        ((value as? Number)?.toDouble() ?: return@withContext).coerceAtLeast(0.0)
      "mapStyleKey" ->
        validMapStyleKey(value) ?: return@withContext
      "mapNavigationMode" ->
        validMapNavigationMode(value) ?: return@withContext
      "historyMetricGradientsEnabled" -> value as? Boolean ?: return@withContext
      "historyMetricHotRanges" ->
        validHistoryMetricHotRanges(value) ?: return@withContext
      else -> return@withContext
    }
    val normalizedKey = when (key) {
      "avgSpeedCutoffKmh", "movingAvgSpeedThresholdKmh" -> "movingSpeedThresholdKmh"
      else -> key
    }
    val default: Any? = AppSettings().let { d ->
      when (normalizedKey) {
        "liveHistoryLimit" -> d.liveHistoryLimit
        "autoConnect" -> d.autoConnect
        "autoRecording" -> d.autoRecording
        "selectedBoardId" -> d.selectedBoardId
        "lastGpsLatitude" -> d.lastGpsLatitude
        "lastGpsLongitude" -> d.lastGpsLongitude
        "movingSpeedThresholdKmh" -> d.movingSpeedThresholdKmh
        "freeSpinMaxSpeedDeltaKmh" -> d.freeSpinMaxSpeedDeltaKmh
        "freeSpinStationaryBoardCapKmh" -> d.freeSpinStationaryBoardCapKmh
        "mapStyleKey" -> d.mapStyleKey
        "mapNavigationMode" -> d.mapNavigationMode
        "historyMetricGradientsEnabled" -> d.historyMetricGradientsEnabled
        "historyMetricHotRanges" -> d.historyMetricHotRanges
        else -> null
      }
    }
    if (coerced == default) {
      dao.deleteAppSetting(normalizedKey)
    } else {
      dao.upsertAppSetting(
        AppSettingEntity(
          key = normalizedKey,
          valueJson = encodeSettingJson(coerced),
          updatedAt = System.currentTimeMillis(),
        ),
      )
    }
  }

  suspend fun updateLastGpsLocation(latitude: Double, longitude: Double): Unit = withContext(Dispatchers.IO) {
    val now = System.currentTimeMillis()
    dao.upsertAppSetting(AppSettingEntity("lastGpsLatitude", encodeSettingJson(latitude), now))
    dao.upsertAppSetting(AppSettingEntity("lastGpsLongitude", encodeSettingJson(longitude), now))
  }

  suspend fun setSelectedBoardId(id: String?): Unit = updateSetting("selectedBoardId", id)

  suspend fun getTuneProfiles(boardId: String): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    dao.getTuneProfilesByBoard(boardId).map { it.toMap() }
  }

  suspend fun getTuneProfile(id: String): Map<String, Any?>? = withContext(Dispatchers.IO) {
    dao.getTuneProfile(id)?.toMap()
  }

  suspend fun createProfile(boardId: String, name: String, fields: Map<String, Any?>): Map<String, Any?> =
    withContext(Dispatchers.IO) {
      val now = System.currentTimeMillis()
      val fieldsJson = fields.toJsonObject().toString()
      val profile = TuneProfileEntity(
        id = UUID.randomUUID().toString(),
        boardId = boardId,
        name = name,
        fieldsJson = fieldsJson,
        createdAt = now,
        updatedAt = now,
      )
      dao.upsertTuneProfile(profile)
      dao.insertTuneHistoryEntry(
        TuneHistoryEntryEntity(
          profileId = profile.id,
          fieldsJson = fieldsJson,
          createdAt = now,
        ),
      )
      profile.toMap()
    }

  suspend fun renameProfile(profileId: String, name: String): Map<String, Any?> =
    withContext(Dispatchers.IO) {
      dao.updateProfileName(profileId, name, System.currentTimeMillis())
      dao.getTuneProfile(profileId)?.toMap()
        ?: throw IllegalArgumentException("Tune Profile not found: $profileId")
    }

  suspend fun deleteProfile(profileId: String): Unit = withContext(Dispatchers.IO) {
    dao.deleteTuneProfileSafe(profileId)
  }

  suspend fun getProfileHistory(profileId: String): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    dao.getTuneHistoryEntries(profileId).map { it.toMap() }
  }

  suspend fun rollbackProfile(profileId: String, historyEntryId: Long): Map<String, Any?> =
    withContext(Dispatchers.IO) {
      dao.rollbackTuneProfile(profileId, historyEntryId).toMap()
    }

  suspend fun copyProfileToBoard(profileId: String, targetBoardId: String, newName: String): Map<String, Any?> =
    withContext(Dispatchers.IO) {
      val source = dao.getTuneProfile(profileId)
        ?: throw IllegalArgumentException("Source profile not found: $profileId")
      val now = System.currentTimeMillis()
      val copy = TuneProfileEntity(
        id = UUID.randomUUID().toString(),
        boardId = targetBoardId,
        name = newName,
        fieldsJson = source.fieldsJson,
        createdAt = now,
        updatedAt = now,
      )
      dao.upsertTuneProfile(copy)
      dao.insertTuneHistoryEntry(
        TuneHistoryEntryEntity(
          profileId = copy.id,
          fieldsJson = copy.fieldsJson,
          createdAt = now,
        ),
      )
      copy.toMap()
    }

  suspend fun saveProfile(profileId: String, fields: Map<String, Any?>): Map<String, Any?> =
    withContext(Dispatchers.IO) {
      dao.saveTuneProfile(
        profileId = profileId,
        fieldsJson = fields.toJsonObject().toString(),
        updatedAt = System.currentTimeMillis(),
      ).toMap()
    }

  internal suspend fun createMainTuneProfileIfMissing(snapshot: RefloatConfigSnapshot): Map<String, Any?>? =
    withContext(Dispatchers.IO) {
      val boardId = snapshot.boardId?.takeIf { it.isNotBlank() } ?: return@withContext null
      val fieldsJson = snapshot.fieldsJson()
      val now = System.currentTimeMillis()
      val profile = TuneProfileEntity(
        id = UUID.randomUUID().toString(),
        boardId = boardId,
        name = "Main",
        fieldsJson = fieldsJson,
        createdAt = now,
        updatedAt = now,
      )
      val history = TuneHistoryEntryEntity(
        profileId = profile.id,
        fieldsJson = fieldsJson,
        createdAt = now,
      )
      dao.insertTuneProfileIfBoardHasNone(profile, history)?.toMap()
    }

  suspend fun getPrivacyZones(): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    dao.getPrivacyZones().map { it.toMap() }
  }

  suspend fun getEnabledPrivacyZoneEntities(): List<PrivacyZoneEntity> = withContext(Dispatchers.IO) {
    dao.getEnabledPrivacyZones()
  }

  suspend fun upsertPrivacyZone(zone: Map<String, Any?>): Unit = withContext(Dispatchers.IO) {
    dao.upsertPrivacyZone(zone.toPrivacyZoneEntity())
  }

  suspend fun setPrivacyZoneEnabled(id: String, enabled: Boolean): Unit = withContext(Dispatchers.IO) {
    dao.setPrivacyZoneEnabled(id, enabled, System.currentTimeMillis())
  }

  suspend fun deletePrivacyZone(id: String): Unit = withContext(Dispatchers.IO) {
    dao.deletePrivacyZone(id)
  }

  suspend fun getMapPoints(): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    dao.getMapPoints().map { it.toMap() }
  }

  suspend fun upsertMapPoint(point: Map<String, Any?>): Unit = withContext(Dispatchers.IO) {
    dao.upsertMapPoint(point.toMapPointEntity())
  }

  suspend fun replaceDirectionMapPoint(point: Map<String, Any?>): Unit = withContext(Dispatchers.IO) {
    dao.replaceDirectionMapPoint(point.toDirectionMapPointEntity())
  }

  suspend fun deleteMapPoint(id: String): Unit = withContext(Dispatchers.IO) {
    dao.deleteMapPoint(id)
  }

  suspend fun getAutoConnectBoard(): Map<String, Any?>? = withContext(Dispatchers.IO) {
    val settings = getTypedSettings()
    settings.selectedBoardId
      ?.let { dao.getBoard(it) }
      ?.let { it.toMap(dao.getBoardSettings(it.id)) }
      ?: dao.getBoards().firstOrNull()?.let { it.toMap(dao.getBoardSettings(it.id)) }
  }

  companion object {
    @Volatile
    private var instance: AppDataRepository? = null

    fun get(context: Context): AppDataRepository {
      return instance ?: synchronized(this) {
        instance ?: AppDataRepository(context.applicationContext).also { instance = it }
      }
    }

    fun resetForDatabaseSwap() {
      synchronized(this) {
        instance = null
      }
    }
  }
}

fun BoardEntity.toMap(settings: List<BoardSettingEntity>): Map<String, Any?> {
  val values = settings.mapNotNull { it.decodeBoardSetting() }.toMap()
  // A Board Link exists only when both a BLE peripheral and a proven transport
  // are stored; a partial bleId-without-transport row reads as unlinked.
  val transport = values["transport"]
  val link = if (bleId != null && transport != null) {
    mapOf("bleId" to bleId, "transport" to transport)
  } else {
    null
  }
  return mapOf(
    "id" to id,
    "name" to name,
    "description" to values["description"],
    "createdAt" to createdAt,
    "batteryConfig" to values["batteryConfig"],
    "link" to link,
  )
}

fun AppSettings.toMap(): Map<String, Any?> = mapOf(
  "liveHistoryLimit" to liveHistoryLimit,
  "autoConnect" to autoConnect,
  "autoRecording" to autoRecording,
  "selectedBoardId" to selectedBoardId,
  "lastGpsLatitude" to lastGpsLatitude,
  "lastGpsLongitude" to lastGpsLongitude,
  "movingSpeedThresholdKmh" to movingSpeedThresholdKmh,
  "freeSpinMaxSpeedDeltaKmh" to freeSpinMaxSpeedDeltaKmh,
  "freeSpinStationaryBoardCapKmh" to freeSpinStationaryBoardCapKmh,
  "mapStyleKey" to mapStyleKey,
  "mapNavigationMode" to mapNavigationMode,
  "historyMetricGradientsEnabled" to historyMetricGradientsEnabled,
  "historyMetricHotRanges" to historyMetricHotRanges,
)

internal fun encodeSettingJson(value: Any?): String {
  val arr = JSONArray()
  arr.put(jsonCompatibleValue(value))
  val s = arr.toString()
  return s.substring(1, s.length - 1)
}

internal fun decodeSettingJson(json: String): Any? {
  val obj = JSONObject("{\"v\":$json}")
  val v = obj.get("v")
  return jsonValue(v)
}

fun AlertRuleEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "controlId" to controlId,
  "threshold" to threshold,
  "thresholdMax" to thresholdMax,
  "enabled" to enabled,
  "soundType" to soundType,
  "createdAt" to createdAt,
)

fun TuneProfileEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "boardId" to boardId,
  "name" to name,
  "fields" to fieldsJson.toJsonMap(),
  "createdAt" to createdAt,
  "updatedAt" to updatedAt,
)

fun TuneHistoryEntryEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "profileId" to profileId,
  "fields" to fieldsJson.toJsonMap(),
  "createdAt" to createdAt,
)

private fun RefloatConfigSnapshot.fieldsJson(): String {
  val json = JSONObject()
  groups.forEach { group ->
    group.fields.forEach { field ->
      json.put(field.id, field.value)
    }
  }
  return json.toString()
}

private fun Map<String, Any?>.toJsonObject(): JSONObject {
  val json = JSONObject()
  forEach { (key, value) ->
    json.put(key, jsonCompatibleValue(value))
  }
  return json
}

private fun jsonCompatibleValue(value: Any?): Any = when (value) {
  null -> JSONObject.NULL
  is Map<*, *> -> {
    val json = JSONObject()
    value.forEach { (key, item) ->
      if (key is String) json.put(key, jsonCompatibleValue(item))
    }
    json
  }
  is Iterable<*> -> JSONArray().also { arr ->
    value.forEach { arr.put(jsonCompatibleValue(it)) }
  }
  is Array<*> -> JSONArray().also { arr ->
    value.forEach { arr.put(jsonCompatibleValue(it)) }
  }
  else -> value
}

private fun String.toJsonMap(): Map<String, Any?> {
  val json = JSONObject(this)
  val result = mutableMapOf<String, Any?>()
  val keys = json.keys()
  while (keys.hasNext()) {
    val key = keys.next()
    result[key] = jsonValue(json.get(key))
  }
  return result
}

private fun jsonValue(value: Any?): Any? {
  return when (value) {
    JSONObject.NULL -> null
    is JSONObject -> {
      val result = mutableMapOf<String, Any?>()
      val keys = value.keys()
      while (keys.hasNext()) {
        val key = keys.next()
        result[key] = jsonValue(value.get(key))
      }
      result
    }
    is JSONArray -> List(value.length()) { index -> jsonValue(value.get(index)) }
    else -> value
  }
}

fun PrivacyZoneEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "preset" to preset,
  "name" to name,
  "enabled" to enabled,
  "centerLatitude" to centerLatitudeE7 / 10_000_000.0,
  "centerLongitude" to centerLongitudeE7 / 10_000_000.0,
  "radiusMeters" to radiusMeters,
  "createdAt" to createdAt,
  "updatedAt" to updatedAt,
)

internal const val MAP_POINT_KIND_DIRECTION = "direction"
internal val VALID_MAP_POINT_KINDS = setOf(
  MAP_POINT_KIND_DIRECTION,
  "drop",
  "bonk",
  "nose_slide",
  "trail_entry",
  "viewpoint",
  "charging",
  "charging_food",
)

fun MapPointEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "kind" to kind,
  "latitude" to latitudeE7 / 10_000_000.0,
  "longitude" to longitudeE7 / 10_000_000.0,
  "createdAt" to createdAt,
  "updatedAt" to updatedAt,
)

internal fun Map<String, Any?>.toMapPointEntity(): MapPointEntity {
  val now = System.currentTimeMillis()
  val kind = getString("kind").takeIf { it in VALID_MAP_POINT_KINDS }
    ?: throw IllegalArgumentException("Invalid Map Point kind: ${get("kind")}")
  val latitude = getDouble("latitude")
  val longitude = getDouble("longitude")
  require(latitude.isFinite() && longitude.isFinite()) { "Invalid Map Point coordinate" }
  return MapPointEntity(
    id = getString("id"),
    kind = kind,
    latitudeE7 = (latitude * 10_000_000.0).toInt(),
    longitudeE7 = (longitude * 10_000_000.0).toInt(),
    createdAt = (get("createdAt") as? Number)?.toLong() ?: now,
    updatedAt = (get("updatedAt") as? Number)?.toLong() ?: now,
  )
}

internal fun Map<String, Any?>.toDirectionMapPointEntity(): MapPointEntity =
  toMapPointEntity().copy(kind = MAP_POINT_KIND_DIRECTION)

private fun Map<String, Any?>.toPrivacyZoneEntity(): PrivacyZoneEntity {
  val now = System.currentTimeMillis()
  return PrivacyZoneEntity(
    id = getString("id"),
    preset = get("preset") as? String ?: "custom",
    name = getString("name"),
    enabled = getBoolean("enabled"),
    centerLatitudeE7 = ((getDouble("centerLatitude")) * 10_000_000.0).toInt(),
    centerLongitudeE7 = ((getDouble("centerLongitude")) * 10_000_000.0).toInt(),
    radiusMeters = (get("radiusMeters") as? Number)?.toInt()
      ?: throw IllegalArgumentException("Missing number field: radiusMeters"),
    createdAt = (get("createdAt") as? Number)?.toLong() ?: now,
    updatedAt = (get("updatedAt") as? Number)?.toLong() ?: now,
  )
}

@Suppress("UNCHECKED_CAST")
private fun Map<String, Any?>.boardLink(): Map<String, Any?>? = get("link") as? Map<String, Any?>

private fun Map<String, Any?>.toBoardEntity(): BoardEntity = BoardEntity(
  id = getString("id"),
  name = getString("name"),
  bleId = (boardLink()?.get("bleId") as? String)?.takeIf { it.isNotBlank() },
  createdAt = getLong("createdAt"),
)

private fun Map<String, Any?>.toBoardSettingEntities(boardId: String): Pair<List<BoardSettingEntity>, List<String>> {
  val now = System.currentTimeMillis()
  val settings = mutableListOf<BoardSettingEntity>()
  val deletedKeys = mutableListOf<String>()

  fun putOrDelete(key: String, value: Any?) {
    if (value == null) {
      deletedKeys += key
    } else {
      settings += BoardSettingEntity(boardId, key, encodeSettingJson(value), now)
    }
  }

  putOrDelete("description", (get("description") as? String)?.takeIf { it.isNotBlank() })
  putOrDelete("batteryConfig", normalizeBatteryConfig(get("batteryConfig")))
  putOrDelete(
    "transport",
    BoardTransport.encode(BoardTransport.fromBridge(boardLink()?.get("transport"))),
  )

  return settings to deletedKeys
}

private fun BoardSettingEntity.decodeBoardSetting(): Pair<String, Any?>? {
  val raw = try {
    decodeSettingJson(valueJson)
  } catch (_: Exception) {
    return null
  }
  return when (key) {
    "description" -> (raw as? String)?.let { key to it }
    "batteryConfig" -> normalizeBatteryConfig(raw)?.let { key to it }
    "transport" -> (raw as? String)?.let {
      key to BoardTransport.toBridge(BoardTransport.decode(it))
    }
    else -> null
  }
}

internal fun encodeBatteryConfig(value: Any?): String? {
  val config = normalizeBatteryConfig(value) ?: return null
  return config.toJsonObject().toString()
}

internal fun normalizeBatteryConfig(value: Any?): Map<String, Any?>? {
  val config = when (value) {
    is Map<*, *> -> value
    is String -> parseLegacyMapString(value) ?: return null
    else -> return null
  }
  val mode = config["mode"] as? String ?: return null
  return when (mode) {
    "preset" -> {
      val cellPresetId = config["cellPresetId"] as? String ?: return null
      val seriesCount = (config["seriesCount"] as? Number)?.toInt() ?: return null
      val parallelCount = (config["parallelCount"] as? Number)?.toInt() ?: return null
      if (cellPresetId.isBlank() || seriesCount < 1 || parallelCount < 1) return null
      mapOf(
        "mode" to "preset",
        "cellPresetId" to cellPresetId,
        "seriesCount" to seriesCount,
        "parallelCount" to parallelCount,
      )
    }
    "manual" -> {
      val minVoltage = (config["minVoltage"] as? Number)?.toDouble() ?: return null
      val maxVoltage = (config["maxVoltage"] as? Number)?.toDouble() ?: return null
      if (!minVoltage.isFinite() || !maxVoltage.isFinite() || maxVoltage <= minVoltage) return null
      mapOf(
        "mode" to "manual",
        "minVoltage" to minVoltage,
        "maxVoltage" to maxVoltage,
      )
    }
    else -> return null
  }
}

private fun parseLegacyMapString(value: String): Map<String, Any?>? {
  val trimmed = value.trim()
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null
  val body = trimmed.substring(1, trimmed.length - 1)
  if (body.isBlank()) return emptyMap()
  return body.split(", ").mapNotNull { entry ->
    val separator = entry.indexOf('=')
    if (separator <= 0) return@mapNotNull null
    val key = entry.substring(0, separator)
    val raw = entry.substring(separator + 1)
    key to (raw.toIntOrNull() ?: raw.toDoubleOrNull() ?: raw)
  }.toMap()
}

private fun Map<String, Any?>.toAlertRuleEntity(): AlertRuleEntity = AlertRuleEntity(
  id = getString("id"),
  controlId = getString("controlId"),
  threshold = getDouble("threshold"),
  thresholdMax = getDoubleOrNull("thresholdMax"),
  enabled = getBoolean("enabled"),
  soundType = get("soundType") as? String ?: "default",
  createdAt = getLong("createdAt"),
)

private fun Map<String, Any?>.getString(key: String): String =
  get(key) as? String ?: throw IllegalArgumentException("Missing string field: $key")

private fun Map<String, Any?>.getBoolean(key: String): Boolean = when (val value = get(key)) {
  is Boolean -> value
  is Number -> value.toInt() != 0
  else -> false
}

private fun Map<String, Any?>.getLong(key: String): Long =
  (get(key) as? Number)?.toLong() ?: throw IllegalArgumentException("Missing number field: $key")

private fun Map<String, Any?>.getDouble(key: String): Double =
  (get(key) as? Number)?.toDouble() ?: throw IllegalArgumentException("Missing number field: $key")

private fun Map<String, Any?>.getDoubleOrNull(key: String): Double? =
  (get(key) as? Number)?.toDouble()
