package expo.modules.vescble

import android.os.Handler
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Group Ride **observe** client: a native WebSocket to the relay server that lives in the
 * foreground service and surfaces ride-lifecycle events to JS. Observing sends NOTHING — it
 * only receives the active-ride [snapshot] on connect, then `ride-created` / `ride-updated` /
 * `ride-ended` deltas (global fan-out). Location leaves the device only when creating/joining
 * (later slices), never while observing.
 *
 * Wire protocol: vescape-server `docs/group-ride/PROTOCOL.md`. All state is touched on the
 * main thread ([handler]); OkHttp callbacks hop back onto it before mutating anything.
 */
internal class GroupRideObserver(
    private val handler: Handler,
    private val emit: (String, Map<String, Any?>) -> Unit,
) {
    private val client = OkHttpClient.Builder()
        .pingInterval(PING_INTERVAL_SECONDS, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var serverUrl: String? = null
    private var reconnectAttempt = 0
    private var stopped = true
    private var riderId: String? = null
    private var riderName: String? = null
    private var riderColor: String? = null
    private var joinedRideId: String? = null
    private var desiredRideId: String? = null
    private var lastPresence: RiderPresence? = null
    private val reconnectRunnable = Runnable { connect() }
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            val ws = webSocket
            if (!stopped && ws != null && joinedRideId != null) {
                ws.send(JSONObject().put("type", "heartbeat").toString())
                handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    /** True while the observe connection should be kept alive (drives service idle checks). */
    val active: Boolean get() = !stopped

    fun start(url: String) {
        if (!stopped && url == serverUrl) return
        stopped = false
        serverUrl = url
        reconnectAttempt = 0
        connect()
    }

    fun stop() {
        stopped = true
        handler.removeCallbacks(reconnectRunnable)
        webSocket?.close(NORMAL_CLOSURE, "client stop")
        webSocket = null
        joinedRideId = null
        desiredRideId = null
        lastPresence = null
        stopHeartbeat()
        emitConnection("idle")
    }

    /**
     * Create a Group Ride over the live observe socket: bind this connection's Rider with
     * `hello`, then send `create` carrying the creator's location and optional name. This is
     * the only location egress while observing. The server fans the result back as
     * `ride-created`, so there is no local optimistic insert here. No-op when not connected.
     */
    fun create(riderId: String, riderName: String, riderColor: String?, name: String?, lat: Double, lng: Double) {
        handler.post {
            val ws = webSocket
            if (stopped || ws == null) {
                Log.w(TAG, "create ignored: observe socket not connected")
                return@post
            }
            if (joinedRideId != null || desiredRideId != null) {
                ws.send(JSONObject().put("type", "leave").toString())
                joinedRideId = null
                desiredRideId = null
                stopHeartbeat()
            }
            sendHello(ws, riderId, riderName, riderColor)
            lastPresence = RiderPresence(lat = lat, lng = lng, heading = null, speed = null, soc = null, motorTemp = null, ctrlTemp = null, phoneBattery = null, boardName = null)
            val create = JSONObject()
                .put("type", "create")
                .put("location", JSONObject().put("lat", lat).put("lng", lng))
            if (!name.isNullOrBlank()) create.put("name", name)
            ws.send(create.toString())
        }
    }

    fun join(riderId: String, riderName: String, riderColor: String?, rideId: String, presence: RiderPresence?) {
        handler.post {
            val ws = webSocket
            if (stopped || ws == null) {
                Log.w(TAG, "join ignored: observe socket not connected")
                return@post
            }
            val previousRideId = joinedRideId ?: desiredRideId
            if (previousRideId != null && previousRideId != rideId) {
                ws.send(JSONObject().put("type", "leave").toString())
                joinedRideId = null
                stopHeartbeat()
            }
            sendHello(ws, riderId, riderName, riderColor)
            desiredRideId = rideId
            presence?.let { lastPresence = it }
            val join = JSONObject()
                .put("type", "join")
                .put("rideId", rideId)
            presence?.let { join.put("presence", it.toJson()) }
            ws.send(join.toString())
        }
    }

    fun leave() {
        handler.post {
            val ws = webSocket ?: return@post
            ws.send(JSONObject().put("type", "leave").toString())
            joinedRideId = null
            desiredRideId = null
            stopHeartbeat()
            emit("onGroupRideJoined", mapOf("rideId" to null))
            emit("onGroupRideRoster", mapOf("rideId" to null, "riders" to emptyList<Map<String, Any?>>()))
        }
    }

    /**
     * Re-bind this connection's Rider identity after a name/color change. Updates the
     * remembered identity (so a reconnect re-announces the fresh values) and, while the
     * socket is live, re-sends `hello` — the server re-emits the roster so peers update
     * without a rejoin. No-op when the observe socket is not connected.
     */
    fun updateIdentity(riderId: String, riderName: String, riderColor: String?) {
        handler.post {
            this.riderId = riderId
            this.riderName = riderName
            this.riderColor = riderColor
            val ws = webSocket
            if (stopped || ws == null) return@post
            sendHello(ws, riderId, riderName, riderColor)
        }
    }

    fun pushPresence(presence: RiderPresence) {
        handler.post {
            val ws = webSocket
            if (stopped || ws == null || joinedRideId == null) return@post
            lastPresence = presence
            ws.send(
                JSONObject()
                    .put("type", "presence")
                    .put("presence", presence.toJson())
                    .toString(),
            )
        }
    }

    private fun connect() {
        val url = serverUrl ?: return
        if (stopped) return
        emitConnection("connecting")
        val request = Request.Builder().url(url).build()
        webSocket = client.newWebSocket(request, listener)
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(ws: WebSocket, response: Response) {
            handler.post {
                if (stopped) return@post
                reconnectAttempt = 0
                emitConnection("connected")
                val id = riderId
                val name = riderName
                if (id != null && name != null) sendHello(ws, id, name, riderColor)
                val rideId = desiredRideId
                if (rideId != null && id != null && name != null) sendJoin(ws, rideId, lastPresence)
            }
        }

        override fun onMessage(ws: WebSocket, text: String) {
            handler.post { if (!stopped) handleMessage(text) }
        }

        override fun onClosing(ws: WebSocket, code: Int, reason: String) {
            ws.close(NORMAL_CLOSURE, null)
        }

        override fun onClosed(ws: WebSocket, code: Int, reason: String) {
            handler.post { scheduleReconnect() }
        }

        override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
            Log.w(TAG, "Group Ride observe WS failure: ${t.message}")
            handler.post { scheduleReconnect() }
        }
    }

    private fun scheduleReconnect() {
        webSocket = null
        if (stopped) return
        joinedRideId = null
        stopHeartbeat()
        emitConnection("disconnected")
        val delay = RECONNECT_DELAYS_MS[reconnectAttempt.coerceAtMost(RECONNECT_DELAYS_MS.lastIndex)]
        reconnectAttempt++
        handler.postDelayed(reconnectRunnable, delay)
    }

    private fun handleMessage(text: String) {
        val json = try {
            JSONObject(text)
        } catch (e: Exception) {
            Log.w(TAG, "Discarding malformed Group Ride frame: ${e.message}")
            return
        }
        when (json.optString("type")) {
            "snapshot" -> {
                val ridesJson = json.optJSONArray("rides")
                val rides = mutableListOf<Map<String, Any?>>()
                if (ridesJson != null) {
                    for (i in 0 until ridesJson.length()) {
                        rideSummary(ridesJson.optJSONObject(i))?.let(rides::add)
                    }
                }
                emit("onGroupRideSnapshot", mapOf("rides" to rides))
            }
            "ride-created" -> rideSummary(json.optJSONObject("ride"))?.let {
                emit("onGroupRideCreated", mapOf("ride" to it))
            }
            "ride-updated" -> rideSummary(json.optJSONObject("ride"))?.let {
                emit("onGroupRideUpdated", mapOf("ride" to it))
            }
            "ride-ended" -> {
                val rideId = json.optString("rideId")
                if (rideId.isNotEmpty()) emit("onGroupRideEnded", mapOf("rideId" to rideId))
                if (rideId.isNotEmpty() && rideId == joinedRideId) {
                    joinedRideId = null
                    desiredRideId = null
                    stopHeartbeat()
                    emit("onGroupRideJoined", mapOf("rideId" to null))
                    emit(
                        "onGroupRideRoster",
                        mapOf("rideId" to null, "riders" to emptyList<Map<String, Any?>>()),
                    )
                }
            }
            "joined" -> {
                val rideId = json.optString("rideId")
                if (rideId.isNotEmpty()) {
                    joinedRideId = rideId
                    desiredRideId = rideId
                    startHeartbeat()
                    emit("onGroupRideJoined", mapOf("rideId" to rideId))
                }
            }
            "roster" -> {
                val ridersJson = json.optJSONArray("riders")
                val riders = mutableListOf<Map<String, Any?>>()
                if (ridersJson != null) {
                    for (i in 0 until ridersJson.length()) {
                        riderView(ridersJson.optJSONObject(i))?.let(riders::add)
                    }
                }
                emit(
                    "onGroupRideRoster",
                    mapOf("rideId" to json.optString("rideId").takeIf { it.isNotEmpty() }, "riders" to riders),
                )
            }
            "error" -> {
                val message = json.optString("message")
                if (message.isNotEmpty()) {
                    handleError(message)
                }
            }
        }
    }

    private fun handleError(message: String) {
        val missingRideId = message.removePrefix(NO_SUCH_RIDE_PREFIX).takeIf { it != message }?.trim()
        if (missingRideId != null) {
            val isCurrentRide = missingRideId == desiredRideId || missingRideId == joinedRideId
            if (!isCurrentRide) return
            joinedRideId = null
            desiredRideId = null
            stopHeartbeat()
            emit("onGroupRideJoined", mapOf("rideId" to null))
            emit("onGroupRideRoster", mapOf("rideId" to null, "riders" to emptyList<Map<String, Any?>>()))
        }
        emit("onGroupRideError", mapOf("message" to message))
    }

    private fun sendHello(ws: WebSocket, riderId: String, riderName: String, riderColor: String?) {
        this.riderId = riderId
        this.riderName = riderName
        this.riderColor = riderColor
        val hello = JSONObject()
            .put("type", "hello")
            .put("riderId", riderId)
            .put("name", riderName)
        if (!riderColor.isNullOrBlank()) hello.put("color", riderColor)
        ws.send(hello.toString())
    }

    private fun sendJoin(ws: WebSocket, rideId: String, presence: RiderPresence?) {
        val join = JSONObject()
            .put("type", "join")
            .put("rideId", rideId)
        presence?.let { join.put("presence", it.toJson()) }
        ws.send(join.toString())
    }

    /** Decode the `RideSummary` shape shared by `snapshot` and `ride-created`. */
    private fun rideSummary(obj: JSONObject?): Map<String, Any?>? {
        obj ?: return null
        val id = obj.optString("id")
        if (id.isEmpty()) return null
        val location = obj.optJSONObject("location") ?: return null
        val creator = obj.optJSONObject("creator") ?: return null
        return mapOf(
            "id" to id,
            "name" to obj.optString("name"),
            "createdAt" to obj.optLong("createdAt"),
            "riderCount" to obj.optInt("riderCount"),
            "location" to mapOf(
                "lat" to location.optDouble("lat"),
                "lng" to location.optDouble("lng"),
            ),
            "creator" to mapOf(
                "id" to creator.optString("id"),
                "name" to creator.optString("name"),
            ),
        )
    }

    private fun riderView(obj: JSONObject?): Map<String, Any?>? {
        obj ?: return null
        val id = obj.optString("id")
        if (id.isEmpty()) return null
        return mapOf(
            "id" to id,
            "name" to obj.optString("name"),
            "color" to obj.optString("color").takeIf { it.isNotEmpty() },
            "presence" to presenceMap(obj.optJSONObject("presence")),
            "trail" to trailList(obj.optJSONArray("trail")),
            "stale" to obj.optBoolean("stale"),
            "lastSeen" to obj.optLong("lastSeen"),
        )
    }

    private fun trailList(arr: JSONArray?): List<Map<String, Any?>>? {
        arr ?: return null
        val points = mutableListOf<Map<String, Any?>>()
        for (i in 0 until arr.length()) {
            val p = arr.optJSONObject(i) ?: continue
            points.add(mapOf("lat" to p.optDouble("lat"), "lng" to p.optDouble("lng")))
        }
        return points
    }

    private fun presenceMap(obj: JSONObject?): Map<String, Any?>? {
        obj ?: return null
        return mapOf(
            "lat" to obj.optDouble("lat"),
            "lng" to obj.optDouble("lng"),
            "heading" to obj.optionalDouble("heading"),
            "speed" to obj.optionalDouble("speed"),
            "soc" to obj.optionalDouble("soc"),
            "motorTemp" to obj.optionalDouble("motorTemp"),
            "ctrlTemp" to obj.optionalDouble("ctrlTemp"),
            "phoneBattery" to obj.optionalDouble("phoneBattery"),
            "boardName" to obj.optString("boardName").takeIf { it.isNotEmpty() },
        )
    }

    private fun emitConnection(state: String) {
        emit("onGroupRideConnection", mapOf("state" to state))
    }

    private fun startHeartbeat() {
        handler.removeCallbacks(heartbeatRunnable)
        handler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL_MS)
    }

    private fun stopHeartbeat() {
        handler.removeCallbacks(heartbeatRunnable)
    }

    companion object {
        private const val TAG = "GroupRideObserver"
        private const val NORMAL_CLOSURE = 1000
        private const val PING_INTERVAL_SECONDS = 20L
        // Must stay well under the server's 5s stale threshold: it's the sole keepalive
        // when a Rider isn't actively streaming presence (stationary, no GPS/board), so a
        // slower beat would leave them perpetually greyed as "Stale".
        private const val HEARTBEAT_INTERVAL_MS = 3_000L
        private const val NO_SUCH_RIDE_PREFIX = "no such ride:"
        private val RECONNECT_DELAYS_MS = longArrayOf(1_000, 2_000, 5_000, 10_000, 30_000)
    }
}

internal data class RiderPresence(
    val lat: Double,
    val lng: Double,
    val heading: Double?,
    val speed: Double?,
    val soc: Double?,
    val motorTemp: Double?,
    val ctrlTemp: Double?,
    val phoneBattery: Double?,
    val boardName: String?,
) {
    fun toJson(): JSONObject {
        val json = JSONObject()
            .put("lat", lat)
            .put("lng", lng)
        heading?.let { json.put("heading", it) }
        speed?.let { json.put("speed", it) }
        soc?.let { json.put("soc", it) }
        motorTemp?.let { json.put("motorTemp", it) }
        ctrlTemp?.let { json.put("ctrlTemp", it) }
        phoneBattery?.let { json.put("phoneBattery", it) }
        boardName?.let { json.put("boardName", it) }
        return json
    }
}

private fun JSONObject.optionalDouble(key: String): Double? =
    if (has(key) && !isNull(key)) optDouble(key) else null
