/**
 * Shared encoding helpers for VESC protocol tests.
 * Mirror the C firmware's buffer_append_* functions so tests produce the exact
 * same bytes the board would send.
 */

/** Encode a signed value as big-endian int16, scaled by 10 (firmware convention). */
function i16x10(val: number): [number, number] {
  const raw = Math.round(val * 10)
  const u = raw < 0 ? raw + 65536 : raw
  return [(u >> 8) & 0xff, u & 0xff]
}

/** Encode a signed value as raw big-endian int16 (no scaling). */
function i16(val: number): [number, number] {
  const u = val < 0 ? val + 65536 : val
  return [(u >> 8) & 0xff, u & 0xff]
}

/**
 * Encode a float as VESC float32_auto (big-endian).
 * Mirrors buffer_append_float32_auto() in lukash/refloat src/conf/buffer.c.
 */
function float32Auto(value: number): [number, number, number, number] {
  if (value === 0) return [0, 0, 0, 0]
  const neg = value < 0 ? 1 : 0
  const abs = Math.abs(value)
  // e = floor(log2(abs)) + 1 so that sig = abs / 2^e ∈ [0.5, 1)
  const e = Math.floor(Math.log2(abs)) + 1
  const sig = abs / Math.pow(2, e)
  const sigI = Math.round((sig - 0.5) * 2.0 * 8388608)
  const eRaw = e + 126
  // >>>0 converts to unsigned 32-bit (required when sign bit is set)
  const res = ((neg << 31) >>> 0) | ((eRaw << 23) >>> 0) | (sigI >>> 0)
  return [(res >>> 24) & 0xff, (res >>> 16) & 0xff, (res >>> 8) & 0xff, res & 0xff]
}

export interface RefloatPayloadOpts {
  balanceCurrent?: number // A
  balancePitch?: number // deg
  roll?: number // deg
  state?: number // raw byte: bits[3:0]=state_compat, bits[7:4]=sat_compat
  switchState?: number
  adc1?: number // 0..1 fraction
  adc2?: number // 0..1 fraction
  pitch?: number // deg
  batteryVoltage?: number // V
  erpm?: number
  speed?: number // km/h (board stores as m/s, we convert)
  motorCurrent?: number // A
  batteryCurrent?: number // A
  dutyCycle?: number // -1..1
  odometer?: number // absolute metres (float32_auto)
  tempMosfet?: number // °C
  tempMotor?: number // °C
  mode?: number
}

/**
 * Build a 42-byte Refloat GET_ALLDATA mode-2 payload.
 * Fields match cmd_send_all_data() in lukash/refloat src/main.c.
 */
export function buildRefloatPayload(opts: RefloatPayloadOpts = {}): Uint8Array {
  const {
    balanceCurrent = 0,
    balancePitch = 0,
    roll = 0,
    state = 1,
    switchState = 0,
    adc1 = 0,
    adc2 = 0,
    pitch = 0,
    batteryVoltage = 50,
    erpm = 0,
    speed = 0,
    motorCurrent = 0,
    batteryCurrent = 0,
    dutyCycle = 0,
    odometer = 0,
    tempMosfet = 25,
    tempMotor = 30,
    mode = 2,
  } = opts

  const b = new Uint8Array(42)

  b[0] = 0x24 // COMM_CUSTOM_APP_DATA
  b[1] = 101 // REFLOAT_MAGIC
  b[2] = 10 // GET_ALLDATA
  b[3] = mode

  ;[b[4], b[5]] = i16x10(balanceCurrent)
  ;[b[6], b[7]] = i16x10(balancePitch)
  ;[b[8], b[9]] = i16x10(roll)

  b[10] = state
  b[11] = switchState
  b[12] = Math.round(adc1 * 50)
  b[13] = Math.round(adc2 * 50)

  // setpoints: (x-128)/5 encoded → 0 stored as 128
  b[14] = 128
  b[15] = 128
  b[16] = 128
  b[17] = 128
  b[18] = 128
  b[19] = 128

  ;[b[20], b[21]] = i16x10(pitch)

  b[22] = 128 // booster current = 0

  ;[b[23], b[24]] = i16x10(batteryVoltage)
  ;[b[25], b[26]] = i16(erpm)
  ;[b[27], b[28]] = i16x10(speed / 3.6) // board stores m/s ×10
  ;[b[29], b[30]] = i16x10(motorCurrent)
  ;[b[31], b[32]] = i16x10(batteryCurrent)

  b[33] = Math.round(dutyCycle * 100) + 128
  b[34] = 222 // foc_id unavailable

  ;[b[35], b[36], b[37], b[38]] = float32Auto(odometer)
  b[39] = Math.round(tempMosfet * 2)
  b[40] = Math.round(tempMotor * 2)
  b[41] = 0 // reserved

  return b
}
