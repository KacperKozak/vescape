/**
 * Refloat VESC package protocol — COMM_CUSTOM_APP_DATA (0x24) commands.
 *
 * Reference: https://github.com/lukash/refloat  src/main.c  cmd_send_all_data()
 */

import { Comm } from './commands';
import type { RefloatValues } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const REFLOAT_MAGIC = 101; // Package ID byte, first byte of every Refloat payload

export enum RefloatCmd {
  GET_ALLDATA = 10,
}

// Marker used by Refloat when a fault is active instead of normal mode byte
const FAULT_MODE_MARKER = 69;

// Compat state values returned by state_compat()
export const REFLOAT_STATE_NAMES: Record<number, string> = {
  0:  'STARTUP',
  1:  'RUNNING',
  2:  'TILTBACK',
  3:  'WHEELSLIP',
  4:  'UPSIDEDOWN',
  5:  'FLYWHEEL',
  6:  'FAULT_PITCH',
  7:  'FAULT_ROLL',
  8:  'FAULT_SW_HALF',
  9:  'FAULT_SW_FULL',
  11: 'FAULT_STARTUP',
  12: 'FAULT_REVERSE',
  13: 'FAULT_QUICKSTOP',
  14: 'CHARGING',
  15: 'DISABLED',
};

// ---------------------------------------------------------------------------
// Command builder
// ---------------------------------------------------------------------------

/**
 * Build a COMMAND_GET_ALLDATA (mode 2) request, wrapped in COMM_FORWARD_CAN.
 *
 * Wire format: [FORWARD_CAN, canId, CUSTOM_APP_DATA, REFLOAT_MAGIC, GET_ALLDATA, mode]
 *
 * Mode 2 includes: balance data + motor data + odometer + temperatures.
 */
export function buildGetAllData(canId: number, mode = 2): Uint8Array {
  return new Uint8Array([
    Comm.FORWARD_CAN,
    canId,
    Comm.CUSTOM_APP_DATA,
    REFLOAT_MAGIC,
    RefloatCmd.GET_ALLDATA,
    mode,
  ]);
}

// ---------------------------------------------------------------------------
// Private decode helpers
// ---------------------------------------------------------------------------

/**
 * Decode 4-byte VESC float32_auto format (big-endian).
 *
 * The encoding uses frexp/ldexp to pack a float into a 32-bit word:
 *   bits [30..23] = biased exponent (e + 126)
 *   bits [22..0]  = normalised mantissa fractional bits
 *   bit  [31]     = sign
 *
 * Reference: buffer_get_float32_auto() in lukash/refloat src/conf/buffer.c
 */
function getFloat32Auto(view: DataView, offset: number): number {
  const res = view.getUint32(offset, false); // always big-endian
  const eRaw = (res >>> 23) & 0xFF;
  const sigI = res & 0x7FFFFF;
  const neg = (res >>> 31) !== 0;

  if (eRaw === 0 && sigI === 0) return 0.0;

  const sig = sigI / (8388608.0 * 2.0) + 0.5;
  const result = sig * Math.pow(2, eRaw - 126);
  return neg ? -result : result;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse a COMM_CUSTOM_APP_DATA / Refloat COMMAND_GET_ALLDATA response.
 *
 * payload[0]  = 0x24  (COMM_CUSTOM_APP_DATA)
 * payload[1]  = 101   (Refloat magic / Package ID)
 * payload[2]  = 10    (COMMAND_GET_ALLDATA)
 * payload[3]  = mode  (2 for us), OR 69 if a fault is active
 * payload[4+] = packed telemetry (see full layout below)
 *
 * Full layout (normal case, mode = 2):
 *   [4-5]   float16×10  balance_current   (A)
 *   [6-7]   float16×10  balance_pitch      (deg)
 *   [8-9]   float16×10  roll               (deg)
 *   [10]    uint8       state (lo=state_compat, hi=sat_compat)
 *   [11]    uint8       switch state
 *   [12]    uint8       adc1 × 50
 *   [13]    uint8       adc2 × 50
 *   [14]    uint8       setpoint × 5 + 128
 *   [15]    uint8       atr.setpoint × 5 + 128
 *   [16]    uint8       brake_tilt.setpoint × 5 + 128
 *   [17]    uint8       torque_tilt.setpoint × 5 + 128
 *   [18]    uint8       turn_tilt.setpoint × 5 + 128
 *   [19]    uint8       remote.setpoint × 5 + 128
 *   [20-21] float16×10  pitch              (deg)
 *   [22]    uint8       booster.current + 128
 *   [23-24] float16×10  battery_voltage    (V)
 *   [25-26] int16       erpm
 *   [27-28] float16×10  speed/3.6          (stored as m/s encoded ×10)
 *   [29-30] float16×10  motor_current      (A)
 *   [31-32] float16×10  battery_current    (A)
 *   [33]    uint8       duty_raw × 100 + 128
 *   [34]    uint8       foc_id × 3  (or 222 if unavailable)
 *   [35-38] float32_auto  odometer (absolute distance, meters)    ← mode ≥ 2
 *   [39]    uint8       mosfet_temp × 2     (°C)                  ← mode ≥ 2
 *   [40]    uint8       motor_temp × 2      (°C)                  ← mode ≥ 2
 *   [41]    uint8       reserved (0)                              ← mode ≥ 2
 */
export function parseGetAllData(payload: Uint8Array): RefloatValues {
  if (payload[0] !== Comm.CUSTOM_APP_DATA) {
    throw new Error(
      `parseGetAllData: expected CUSTOM_APP_DATA (0x24), got 0x${payload[0]?.toString(16)}`,
    );
  }
  if (payload[1] !== REFLOAT_MAGIC) {
    throw new Error(`parseGetAllData: expected magic ${REFLOAT_MAGIC}, got ${payload[1]}`);
  }
  if (payload[2] !== RefloatCmd.GET_ALLDATA) {
    throw new Error(`parseGetAllData: expected cmd ${RefloatCmd.GET_ALLDATA}, got ${payload[2]}`);
  }

  const modeByte = payload[3];

  // Fault case — motor has an active mc_fault_code
  if (modeByte === FAULT_MODE_MARKER) {
    const faultCode = payload[4] ?? 0;
    return {
      hasFault: true,
      faultCode,
      pitch: 0, roll: 0, balancePitch: 0,
      balanceCurrent: 0, speed: 0,
      batteryVoltage: 0, motorCurrent: 0, batteryCurrent: 0,
      erpm: 0, dutyCycle: 0,
      state: 0, switchState: 0,
      adc1: 0, adc2: 0,
      odometer: null, tempMosfet: null, tempMotor: null,
    };
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  // --- Balance / IMU data ---
  const balanceCurrent = view.getInt16(4, false) / 10;
  const balancePitch   = view.getInt16(6, false) / 10;
  const roll           = view.getInt16(8, false) / 10;

  // --- State bytes ---
  const stateByte   = payload[10] ?? 0;
  const switchState = payload[11] ?? 0;

  // --- Footpad ADCs ---
  const adc1 = (payload[12] ?? 0) / 50;
  const adc2 = (payload[13] ?? 0) / 50;

  // --- Pitch (primary IMU value used for display) ---
  const pitch = view.getInt16(20, false) / 10;

  // --- Motor / battery ---
  const batteryVoltage = view.getInt16(23, false) / 10;
  const erpm           = view.getInt16(25, false);
  // speed stored as (km/h / 3.6) * 10; decode → m/s / 10 * 3.6 = km/h
  const speedRaw       = view.getInt16(27, false) / 10; // m/s
  const speed          = speedRaw * 3.6;                // km/h
  const motorCurrent   = view.getInt16(29, false) / 10;
  const batteryCurrent = view.getInt16(31, false) / 10;
  const dutyCycle      = ((payload[33] ?? 128) - 128) / 100;

  // --- Mode ≥ 2 fields ---
  let odometer:  number | null = null;
  let tempMosfet: number | null = null;
  let tempMotor:  number | null = null;

  const mode = modeByte as number;
  if (mode >= 2 && payload.length >= 42) {
    odometer  = getFloat32Auto(view, 35); // absolute distance in metres
    tempMosfet = (payload[39] ?? 0) / 2;
    tempMotor  = (payload[40] ?? 0) / 2;
  }

  return {
    hasFault: false,
    faultCode: 0,
    pitch,
    roll,
    balancePitch,
    balanceCurrent,
    speed,
    batteryVoltage,
    motorCurrent,
    batteryCurrent,
    erpm,
    dutyCycle,
    state: stateByte,
    switchState,
    adc1,
    adc2,
    odometer,
    tempMosfet,
    tempMotor,
  };
}
