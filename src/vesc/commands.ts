/**
 * VESC command IDs — subset needed for the PoC.
 * Full enum: vedderb/bldc datatypes.h → COMM_PACKET_ID
 */
export enum Comm {
  FW_VERSION = 0,
  GET_VALUES = 4,
  FORWARD_CAN = 34, // wraps a command: [FORWARD_CAN, canId, <command>]
  CUSTOM_APP_DATA = 36, // Refloat / custom VESC package commands
  PING_CAN = 62, // response: [PING_CAN, id0, id1, ...] = live CAN device IDs
}

/**
 * Build a COMM_GET_VALUES request payload.
 * On the Floatwheel ADV2, the ESP32 is a BLE→CAN bridge — GET_VALUES must be
 * forwarded to the VESC motor controller via COMM_FORWARD_CAN.
 */
function buildGetValues(canId?: number): Uint8Array {
  if (canId !== undefined) {
    return new Uint8Array([Comm.FORWARD_CAN, canId, Comm.GET_VALUES])
  }
  return new Uint8Array([Comm.GET_VALUES])
}

/** Build a COMM_FW_VERSION request — handled locally by the BLE bridge itself. */
function buildFwVersion(): Uint8Array {
  return new Uint8Array([Comm.FW_VERSION])
}

/** Build a COMM_PING_CAN request — asks the BLE bridge to enumerate CAN devices. */
function buildPingCan(): Uint8Array {
  return new Uint8Array([Comm.PING_CAN])
}

/**
 * Parse a COMM_PING_CAN response payload.
 * Returns the list of CAN device IDs that responded to the ping.
 */
function parsePingCan(payload: Uint8Array): number[] {
  if (payload[0] !== Comm.PING_CAN) return []
  return Array.from(payload.slice(1))
}
