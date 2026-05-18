package expo.modules.vescble.telemetry

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AppDataRepository private constructor(context: Context) {
  private val dao = TelemetryDatabase.get(context).telemetryDao()

  suspend fun getBoards(): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    dao.getBoards().map { it.toMap() }
  }

  suspend fun getBoard(id: String): Map<String, Any?>? = withContext(Dispatchers.IO) {
    dao.getBoard(id)?.toMap()
  }

  suspend fun upsertBoard(board: Map<String, Any?>): Unit = withContext(Dispatchers.IO) {
    dao.upsertBoard(board.toBoardEntity())
  }

  suspend fun deleteBoard(id: String): Unit = withContext(Dispatchers.IO) {
    dao.deleteBoard(id)
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
    (dao.getSettings() ?: AppSettingsEntity()).toMap()
  }

  suspend fun getSettingsEntity(): AppSettingsEntity = withContext(Dispatchers.IO) {
    dao.getSettings() ?: AppSettingsEntity()
  }

  suspend fun updateSetting(key: String, value: Any?): Unit = withContext(Dispatchers.IO) {
    val current = dao.getSettings() ?: AppSettingsEntity()
    val updated = when (key) {
      "liveHistoryLimit" -> current.copy(liveHistoryLimit = (value as? Number)?.toInt() ?: 5)
      "autoConnect" -> current.copy(autoConnect = value as? Boolean ?: true)
      "autoRecording" -> current.copy(autoRecording = value as? Boolean ?: false)
      "selectedBoardId" -> current.copy(selectedBoardId = value as? String)
      "lastGpsLatitude" -> current.copy(lastGpsLatitude = (value as? Number)?.toDouble())
      "lastGpsLongitude" -> current.copy(lastGpsLongitude = (value as? Number)?.toDouble())
      else -> current
    }
    dao.upsertSettings(updated)
  }

  suspend fun updateLastGpsLocation(latitude: Double, longitude: Double): Unit = withContext(Dispatchers.IO) {
    val current = dao.getSettings() ?: AppSettingsEntity()
    dao.upsertSettings(
      current.copy(
        lastGpsLatitude = latitude,
        lastGpsLongitude = longitude,
      ),
    )
  }

  suspend fun setSelectedBoardId(id: String?): Unit = updateSetting("selectedBoardId", id)

  suspend fun getAutoConnectBoard(): Map<String, Any?>? = withContext(Dispatchers.IO) {
    val settings = dao.getSettings() ?: AppSettingsEntity()
    settings.selectedBoardId
      ?.let { dao.getBoard(it) }
      ?.toMap()
      ?: dao.getBoards().firstOrNull { it.isStarred }?.toMap()
      ?: dao.getBoards().firstOrNull()?.toMap()
  }

  companion object {
    @Volatile
    private var instance: AppDataRepository? = null

    fun get(context: Context): AppDataRepository {
      return instance ?: synchronized(this) {
        instance ?: AppDataRepository(context.applicationContext).also { instance = it }
      }
    }
  }
}

fun BoardEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "name" to name,
  "description" to description,
  "bleId" to bleId,
  "isStarred" to isStarred,
  "createdAt" to createdAt,
  "minVoltage" to minVoltage,
  "maxVoltage" to maxVoltage,
)

fun AppSettingsEntity.toMap(): Map<String, Any?> = mapOf(
  "liveHistoryLimit" to liveHistoryLimit,
  "autoConnect" to autoConnect,
  "autoRecording" to autoRecording,
  "selectedBoardId" to selectedBoardId,
  "lastGpsLatitude" to lastGpsLatitude,
  "lastGpsLongitude" to lastGpsLongitude,
)

fun AlertRuleEntity.toMap(): Map<String, Any?> = mapOf(
  "id" to id,
  "controlId" to controlId,
  "threshold" to threshold,
  "thresholdMax" to thresholdMax,
  "enabled" to enabled,
  "soundType" to soundType,
  "createdAt" to createdAt,
)

private fun Map<String, Any?>.toBoardEntity(): BoardEntity = BoardEntity(
  id = getString("id"),
  name = getString("name"),
  description = get("description") as? String,
  bleId = get("bleId") as? String,
  isStarred = getBoolean("isStarred"),
  createdAt = getLong("createdAt"),
  minVoltage = getDoubleOrNull("minVoltage"),
  maxVoltage = getDoubleOrNull("maxVoltage"),
)

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
