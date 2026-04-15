import { crc16 } from './crc16';

/**
 * VESC serial framing.
 *
 * Short packet  (payload ≤ 255 bytes): [0x02][len 1B][payload][crc_hi][crc_lo][0x03]
 * Extended packet (payload > 255 bytes): [0x03][len_hi][len_lo][payload][crc_hi][crc_lo][0x03]
 */

const START_SHORT = 0x02;
const START_LONG = 0x03;
const END_BYTE = 0x03;

/**
 * Wrap a raw payload in a VESC frame.
 */
export function encode(payload: Uint8Array): Uint8Array {
  const len = payload.length;
  const isShort = len <= 255;
  // header: 2 bytes (short) or 3 bytes (long)
  // footer: crc_hi + crc_lo + end = 3 bytes
  const frame = new Uint8Array((isShort ? 2 : 3) + len + 3);
  let offset = 0;

  if (isShort) {
    frame[offset++] = START_SHORT;
    frame[offset++] = len;
  } else {
    frame[offset++] = START_LONG;
    frame[offset++] = (len >> 8) & 0xff;
    frame[offset++] = len & 0xff;
  }

  frame.set(payload, offset);
  offset += len;

  const crc = crc16(payload);
  frame[offset++] = (crc >> 8) & 0xff;
  frame[offset++] = crc & 0xff;
  frame[offset++] = END_BYTE;

  return frame;
}

export type DecodeResult = {
  /** Decoded payload (not including framing or CRC) */
  payload: Uint8Array;
  /** Number of bytes consumed from the input buffer */
  consumed: number;
};

/**
 * Attempt to decode one VESC frame from the front of `buf`.
 * Returns null if the buffer does not yet contain a complete valid frame.
 */
export function decode(buf: Uint8Array): DecodeResult | null {
  if (buf.length < 1) return null;

  const startByte = buf[0];

  let headerLen: number;
  let payloadLen: number;

  if (startByte === START_SHORT) {
    // Need at least 2 header bytes
    if (buf.length < 2) return null;
    headerLen = 2;
    payloadLen = buf[1]!;
  } else if (startByte === START_LONG) {
    // Need at least 3 header bytes
    if (buf.length < 3) return null;
    headerLen = 3;
    payloadLen = (buf[1]! << 8) | buf[2]!;
  } else {
    // Not a valid start byte — skip this byte so the reassembler can recover
    return null;
  }

  // Total frame size: header + payload + crc (2) + end (1)
  const totalLen = headerLen + payloadLen + 3;
  if (buf.length < totalLen) return null;

  // Verify end byte
  if (buf[totalLen - 1] !== END_BYTE) return null;

  const payload = buf.slice(headerLen, headerLen + payloadLen);

  // Verify CRC
  const expectedCrc = crc16(payload);
  const actualCrc = (buf[headerLen + payloadLen]! << 8) | buf[headerLen + payloadLen + 1]!;
  if (expectedCrc !== actualCrc) return null;

  return { payload, consumed: totalLen };
}
