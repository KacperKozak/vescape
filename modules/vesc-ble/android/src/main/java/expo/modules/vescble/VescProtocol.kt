package expo.modules.vescble

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.pow

internal const val COMM_FW_VERSION = 0
internal const val COMM_FORWARD_CAN = 34
internal const val COMM_CUSTOM_APP_DATA = 36
internal const val COMM_GET_CUSTOM_CONFIG_XML = 92
internal const val COMM_GET_CUSTOM_CONFIG = 93
internal const val COMM_SET_CUSTOM_CONFIG = 95
internal const val COMM_PING_CAN = 62
internal const val REFLOAT_MAGIC = 101
internal const val REFLOAT_GET_ALLDATA = 10
private const val REFLOAT_FAULT_MODE = 69

internal object VescPacketCodec {
    fun encode(payload: ByteArray): ByteArray {
        val short = payload.size <= 255
        val frame = ByteArray((if (short) 2 else 3) + payload.size + 3)
        var offset = 0
        if (short) {
            frame[offset++] = 0x02
            frame[offset++] = payload.size.toByte()
        } else {
            frame[offset++] = 0x03
            frame[offset++] = ((payload.size shr 8) and 0xff).toByte()
            frame[offset++] = (payload.size and 0xff).toByte()
        }
        payload.copyInto(frame, offset)
        offset += payload.size
        val crc = crc16(payload)
        frame[offset++] = ((crc shr 8) and 0xff).toByte()
        frame[offset++] = (crc and 0xff).toByte()
        frame[offset] = 0x03
        return frame
    }
}

internal class VescPacketReassembler {
    private val buffer = ArrayList<Byte>()

    fun reset() {
        buffer.clear()
    }

    fun feed(chunk: ByteArray): List<ByteArray> {
        chunk.forEach { buffer.add(it) }
        val packets = mutableListOf<ByteArray>()
        while (buffer.isNotEmpty()) {
            val start = buffer[0].toInt() and 0xff
            if (start != 0x02 && start != 0x03) {
                buffer.removeAt(0)
                continue
            }
            val headerLen = if (start == 0x02) 2 else 3
            if (buffer.size < headerLen) break
            val len = if (start == 0x02) {
                buffer[1].toInt() and 0xff
            } else {
                ((buffer[1].toInt() and 0xff) shl 8) or (buffer[2].toInt() and 0xff)
            }
            val total = headerLen + len + 3
            if (buffer.size < total) break
            if ((buffer[total - 1].toInt() and 0xff) != 0x03) {
                buffer.removeAt(0)
                continue
            }
            val payload = ByteArray(len)
            for (i in 0 until len) payload[i] = buffer[headerLen + i]
            val actual = ((buffer[headerLen + len].toInt() and 0xff) shl 8) or
                (buffer[headerLen + len + 1].toInt() and 0xff)
            if (crc16(payload) == actual) {
                packets.add(payload)
                repeat(total) { buffer.removeAt(0) }
            } else {
                buffer.removeAt(0)
            }
        }
        return packets
    }
}

internal fun parseRefloatGetAllData(
    payload: ByteArray,
    avgLatency: Int?,
    packetAt: Long,
    location: LocationSnapshot?,
): RefloatTelemetry? {
    if (payload.size < 5) return null
    if ((payload[0].toInt() and 0xff) != COMM_CUSTOM_APP_DATA) return null
    if ((payload[1].toInt() and 0xff) != REFLOAT_MAGIC) return null
    if ((payload[2].toInt() and 0xff) != REFLOAT_GET_ALLDATA) return null

    val mode = payload[3].toInt() and 0xff
    if (mode == REFLOAT_FAULT_MODE) {
        return RefloatTelemetry(
            hasFault = true,
            faultCode = payload.getOrNull(4)?.toInt()?.and(0xff) ?: 0,
            pitch = 0.0,
            roll = 0.0,
            balancePitch = 0.0,
            balanceCurrent = 0.0,
            speed = 0.0,
            batteryVoltage = 0.0,
            motorCurrent = 0.0,
            batteryCurrent = 0.0,
            erpm = 0,
            dutyCycle = 0.0,
            state = 0,
            switchState = 0,
            adc1 = 0.0,
            adc2 = 0.0,
            odometer = null,
            tempMosfet = null,
            tempMotor = null,
            avgLatency = avgLatency,
            lastPacketAt = packetAt,
            location = location,
        )
    }
    if (payload.size < 34) return null

    val pitch = int16(payload, 20) / 10.0
    val speed = (int16(payload, 27) / 10.0) * 3.6
    val state = payload[10].toInt() and 0xff
    val odometer = if (mode >= 2 && payload.size >= 42) float32Auto(payload, 35) else null
    val dutyRaw = (payload[33].toInt() and 0xff) - 128
    val dutyCycle = if (abs(dutyRaw) <= 1) 0.0 else dutyRaw / 100.0
    return RefloatTelemetry(
        hasFault = false,
        faultCode = 0,
        pitch = pitch,
        roll = int16(payload, 8) / 10.0,
        balancePitch = int16(payload, 6) / 10.0,
        balanceCurrent = int16(payload, 4) / 10.0,
        speed = speed,
        batteryVoltage = int16(payload, 23) / 10.0,
        motorCurrent = int16(payload, 29) / 10.0,
        batteryCurrent = int16(payload, 31) / 10.0,
        erpm = int16(payload, 25),
        dutyCycle = dutyCycle,
        state = state,
        switchState = payload[11].toInt() and 0xff,
        adc1 = (payload[12].toInt() and 0xff) / 50.0,
        adc2 = (payload[13].toInt() and 0xff) / 50.0,
        odometer = odometer,
        tempMosfet = if (mode >= 2 && payload.size >= 42) (payload[39].toInt() and 0xff) / 2.0 else null,
        tempMotor = if (mode >= 2 && payload.size >= 42) (payload[40].toInt() and 0xff) / 2.0 else null,
        avgLatency = avgLatency,
        lastPacketAt = packetAt,
        location = location,
    )
}

private fun crc16(data: ByteArray): Int {
    var crc = 0
    for (b in data) {
        crc = crc xor ((b.toInt() and 0xff) shl 8)
        repeat(8) {
            crc = if ((crc and 0x8000) != 0) {
                ((crc shl 1) xor 0x1021) and 0xffff
            } else {
                (crc shl 1) and 0xffff
            }
        }
    }
    return crc and 0xffff
}

private fun int16(bytes: ByteArray, offset: Int): Int {
    return ByteBuffer.wrap(bytes, offset, 2).order(ByteOrder.BIG_ENDIAN).short.toInt()
}

private fun float32Auto(bytes: ByteArray, offset: Int): Double {
    val raw = ByteBuffer.wrap(bytes, offset, 4).order(ByteOrder.BIG_ENDIAN).int
    val eRaw = (raw ushr 23) and 0xff
    val sigI = raw and 0x7fffff
    val neg = (raw ushr 31) != 0
    if (eRaw == 0 && sigI == 0) return 0.0
    val sig = sigI / (8388608.0 * 2.0) + 0.5
    val result = sig * 2.0.pow(eRaw - 126)
    return if (neg) -result else result
}
