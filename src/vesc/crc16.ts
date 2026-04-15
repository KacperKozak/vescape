/**
 * CRC-16/XMODEM — poly 0x1021, init 0x0000, no reflection, no final XOR.
 *
 * Known test vectors:
 *   crc16(new Uint8Array([0x00]))          === 0x0000
 *   crc16(new TextEncoder().encode("123456789")) === 0x31C3
 */
export function crc16(data: Uint8Array): number {
  let crc = 0x0000;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]! << 8;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}
