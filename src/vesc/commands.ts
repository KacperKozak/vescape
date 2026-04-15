/**
 * VESC command IDs — subset needed for the PoC.
 * Full enum: vedderb/bldc datatypes.h → COMM_PACKET_ID
 */
export enum Comm {
  FW_VERSION = 0,
  GET_VALUES = 4,
  GET_VALUES_SETUP = 47,
}

/**
 * Build a COMM_GET_VALUES request payload (single command byte, no extra data).
 */
export function buildGetValues(): Uint8Array {
  return new Uint8Array([Comm.GET_VALUES]);
}

/**
 * Build a COMM_FW_VERSION request payload (stubbed for PoC).
 */
export function buildFwVersion(): Uint8Array {
  return new Uint8Array([Comm.FW_VERSION]);
}
