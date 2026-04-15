import { Comm } from './commands';
import type { VescValues } from './types';

/**
 * Parse a COMM_GET_VALUES response payload into a typed VescValues object.
 *
 * Field layout from commands.c (vedderb/bldc), all big-endian:
 *   [0]      command byte (Comm.GET_VALUES = 0x04)
 *   [1..2]   tempMosfet   int16 / 10  → °C
 *   [3..4]   tempMotor    int16 / 10  → °C
 *   [5..8]   currentMotor int32 / 100 → A
 *   [9..12]  currentInput int32 / 100 → A
 *   [13..16] id           int32 / 100 → A
 *   [17..20] iq           int32 / 100 → A
 *   [21..22] dutyCycle    int16 / 1000 → 0..1
 *   [23..26] rpm          int32
 *   [27..28] voltage      int16 / 10  → V
 *   [29..32] ampHours     int32 / 10000
 *   [33..36] ampHoursCharged int32 / 10000
 *   [37..40] wattHours    int32 / 10000
 *   [41..44] wattHoursCharged int32 / 10000
 *   [45..48] tachometer   int32
 *   [49..52] tachometerAbs int32
 *   [53]     faultCode    uint8
 */
export function parseGetValues(payload: Uint8Array): VescValues {
  if (payload[0] !== Comm.GET_VALUES) {
    throw new Error(
      `parseGetValues: unexpected command byte 0x${payload[0]?.toString(16) ?? '??'}`,
    );
  }

  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let o = 1; // skip command byte

  const tempMosfet = view.getInt16(o, false) / 10;   o += 2;
  const tempMotor  = view.getInt16(o, false) / 10;   o += 2;
  const currentMotor = view.getInt32(o, false) / 100; o += 4;
  const currentInput = view.getInt32(o, false) / 100; o += 4;
  const id  = view.getInt32(o, false) / 100;          o += 4;
  const iq  = view.getInt32(o, false) / 100;          o += 4;
  const dutyCycle = view.getInt16(o, false) / 1000;   o += 2;
  const rpm       = view.getInt32(o, false);           o += 4;
  const voltage   = view.getInt16(o, false) / 10;     o += 2;
  const ampHours        = view.getInt32(o, false) / 10000; o += 4;
  const ampHoursCharged = view.getInt32(o, false) / 10000; o += 4;
  const wattHours        = view.getInt32(o, false) / 10000; o += 4;
  const wattHoursCharged = view.getInt32(o, false) / 10000; o += 4;
  const tachometer    = view.getInt32(o, false); o += 4;
  const tachometerAbs = view.getInt32(o, false); o += 4;
  const faultCode = view.getUint8(o);

  return {
    tempMosfet,
    tempMotor,
    currentMotor,
    currentInput,
    id,
    iq,
    dutyCycle,
    rpm,
    voltage,
    ampHours,
    ampHoursCharged,
    wattHours,
    wattHoursCharged,
    tachometer,
    tachometerAbs,
    faultCode,
  };
}
