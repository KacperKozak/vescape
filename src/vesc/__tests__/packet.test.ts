import { describe, expect, test } from 'bun:test';
import { encode, decode } from '../packet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uint8(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// encode
// ---------------------------------------------------------------------------

describe('encode', () => {
  test('wraps single-byte payload in a short frame', () => {
    const payload = uint8(0x04); // GET_VALUES
    const frame = encode(payload);

    // [0x02][0x01][0x04][crc_hi][crc_lo][0x03]
    expect(frame.length).toBe(6);
    expect(frame[0]).toBe(0x02); // short start byte
    expect(frame[1]).toBe(1);    // payload length
    expect(frame[2]).toBe(0x04); // payload
    expect(frame[frame.length - 1]).toBe(0x03); // end byte
  });

  test('short packet: max 255-byte payload uses start byte 0x02', () => {
    const payload = new Uint8Array(255).fill(0xaa);
    const frame = encode(payload);
    expect(frame[0]).toBe(0x02);
    expect(frame[1]).toBe(255);
  });

  test('long packet: 256-byte payload uses start byte 0x03', () => {
    const payload = new Uint8Array(256).fill(0xbb);
    const frame = encode(payload);
    expect(frame[0]).toBe(0x03); // long start byte
    expect(frame[1]).toBe(1);    // len_hi
    expect(frame[2]).toBe(0);    // len_lo
    expect(frame[frame.length - 1]).toBe(0x03); // end byte
  });

  test('CRC bytes are non-trivially computed (not zero for most payloads)', () => {
    const payload = uint8(0x04);
    const frame = encode(payload);
    const crcHi = frame[frame.length - 3]!;
    const crcLo = frame[frame.length - 2]!;
    // CRC for [0x04] computed by reference: 0x4084
    expect((crcHi << 8) | crcLo).toBe(0x4084);
  });
});

// ---------------------------------------------------------------------------
// decode
// ---------------------------------------------------------------------------

describe('decode', () => {
  test('returns null for empty buffer', () => {
    expect(decode(uint8())).toBeNull();
  });

  test('returns null for just a start byte', () => {
    expect(decode(uint8(0x02))).toBeNull();
  });

  test('returns null for incomplete frame', () => {
    const payload = uint8(0x04);
    const frame = encode(payload);
    // Feed all but the last byte
    expect(decode(frame.slice(0, frame.length - 1))).toBeNull();
  });

  test('returns null when start byte is invalid', () => {
    expect(decode(uint8(0xff, 0x01, 0x04, 0x00, 0x00, 0x03))).toBeNull();
  });

  test('returns null when CRC is incorrect', () => {
    const payload = uint8(0x04);
    const frame = encode(payload).slice(); // copy
    // Corrupt CRC hi byte
    const corrupted = new Uint8Array(frame);
    corrupted[corrupted.length - 3] ^= 0xff;
    expect(decode(corrupted)).toBeNull();
  });

  test('returns null when end byte is missing', () => {
    const payload = uint8(0x04);
    const frame = encode(payload);
    const noEnd = frame.slice(0, frame.length - 1);
    expect(decode(noEnd)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('encode → decode round-trip', () => {
  test('single byte payload', () => {
    const payload = uint8(0x04);
    const frame = encode(payload);
    const result = decode(frame);

    expect(result).not.toBeNull();
    expect(result!.payload).toEqual(payload);
    expect(result!.consumed).toBe(frame.length);
  });

  test('multi-byte payload', () => {
    const payload = new Uint8Array(50).map((_, i) => i);
    const frame = encode(payload);
    const result = decode(frame);

    expect(result).not.toBeNull();
    expect(result!.payload).toEqual(payload);
    expect(result!.consumed).toBe(frame.length);
  });

  test('255-byte payload (short packet boundary)', () => {
    const payload = new Uint8Array(255).fill(0x55);
    const frame = encode(payload);
    const result = decode(frame);

    expect(result).not.toBeNull();
    expect(result!.payload).toEqual(payload);
  });

  test('256-byte payload (long packet)', () => {
    const payload = new Uint8Array(256).fill(0x77);
    const frame = encode(payload);
    const result = decode(frame);

    expect(result).not.toBeNull();
    expect(result!.payload).toEqual(payload);
  });

  test('consumed bytes equals exact frame length (no trailing data)', () => {
    const payload = uint8(0x00, 0x01, 0x02);
    const frame = encode(payload);
    const result = decode(frame);
    expect(result!.consumed).toBe(frame.length);
  });

  test('decode ignores bytes after a complete frame', () => {
    const payload = uint8(0x04);
    const frame = encode(payload);
    // Append garbage after the frame
    const withGarbage = new Uint8Array([...frame, 0xde, 0xad]);
    const result = decode(withGarbage);

    expect(result).not.toBeNull();
    expect(result!.consumed).toBe(frame.length); // only consumed the frame
  });
});

// ---------------------------------------------------------------------------
// Reassembler integration (back-to-back packets)
// ---------------------------------------------------------------------------

describe('back-to-back frames in decode', () => {
  test('second frame starts at consumed offset', () => {
    const p1 = uint8(0x04);
    const p2 = uint8(0x00);
    const combined = new Uint8Array([...encode(p1), ...encode(p2)]);

    const r1 = decode(combined);
    expect(r1).not.toBeNull();

    const r2 = decode(combined.slice(r1!.consumed));
    expect(r2).not.toBeNull();
    expect(r2!.payload).toEqual(p2);
  });
});
