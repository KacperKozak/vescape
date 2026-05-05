package expo.modules.vescble.telemetry

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AppDataRepository private constructor(context: Context) {
  private val dao = TelemetryDatabase.get(context).telemetryDao()

  suspend fun getBoards(): List<Map<String, Any?>> = withContext(Dispatchers.IO) {
    dao.getBoards().map { it.toMap() }
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
