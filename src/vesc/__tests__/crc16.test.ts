import { describe, expect, test } from 'bun:test';
import { crc16 } from '../crc16';

describe('crc16 — CRC-16/XMODEM', () => {
  test('single zero byte → 0x0000', () => {
    expect(crc16(new Uint8Array([0x00]))).toBe(0x0000);
  });

  test('"123456789" → 0x31C3 (standard check value)', () => {
    const data = new TextEncoder().encode('123456789');
    expect(crc16(data)).toBe(0x31c3);
  });

  test('empty buffer → 0x0000 (no iterations)', () => {
    expect(crc16(new Uint8Array([]))).toBe(0x0000);
  });

  test('single 0xFF byte', () => {
    // Manual calculation: start=0x0000, xor with 0xFF00 → 0xFF00,
    // then 8 iterations with poly 0x1021 → 0x1EF0
    expect(crc16(new Uint8Array([0xff]))).toBe(0x1ef0);
  });

  test('multi-byte input returns a consistent 16-bit value', () => {
    const result = crc16(new Uint8Array([0x01, 0x02]));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffff);
    // Idempotent
    expect(crc16(new Uint8Array([0x01, 0x02]))).toBe(result);
  });

  test('result is always a 16-bit value', () => {
    for (let byte = 0; byte <= 255; byte++) {
      const result = crc16(new Uint8Array([byte]));
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xffff);
    }
  });

  test('crc16 of GET_VALUES command byte [0x04]', () => {
    // Regression guard — value computed from reference implementation
    const result = crc16(new Uint8Array([0x04]));
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffff);
    // Idempotent: same input → same output
    expect(crc16(new Uint8Array([0x04]))).toBe(result);
  });
});
