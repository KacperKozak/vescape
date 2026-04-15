import { decode } from './packet';

/**
 * Stitches BLE notification chunks back into complete VESC packets.
 *
 * BLE MTU is typically 20–244 bytes, so a single VESC packet (e.g. the
 * ~57-byte GET_VALUES response) may arrive as one notification, but could
 * also span multiple.  Back-to-back packets in a single notification are
 * also handled.
 */
export class Reassembler {
  private buf: Uint8Array = new Uint8Array(0);

  /** Drop any accumulated bytes (call on connect/reconnect). */
  reset(): void {
    this.buf = new Uint8Array(0);
  }

  /**
   * Feed a raw BLE notification chunk.
   * Returns an array of fully decoded packet payloads (may be empty).
   */
  feed(chunk: Uint8Array): Uint8Array[] {
    // Append chunk to internal buffer
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const packets: Uint8Array[] = [];

    while (this.buf.length > 0) {
      const result = decode(this.buf);

      if (result === null) {
        // Not enough data yet — if the first byte isn't a valid start byte,
        // skip it so we don't stall on garbage (e.g. truncated packet).
        const b = this.buf[0];
        if (b !== 0x02 && b !== 0x03) {
          this.buf = this.buf.slice(1);
          continue;
        }
        break;
      }

      packets.push(result.payload);
      this.buf = this.buf.slice(result.consumed);
    }

    return packets;
  }
}
