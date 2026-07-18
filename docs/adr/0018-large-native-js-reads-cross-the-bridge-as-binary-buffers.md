# Large native→JS reads cross the bridge as binary buffers

A native read that returns an array of objects pays a bridge cost that scales with `fields × rows`: Expo converts every field of every row across JSI individually, allocating a JS string key and boxing a number each time. For small results this is free; for results whose size scales with sample/row count it dominates, and it stays invisible until a range gets large.

This first bit on Ride History. `getHistoryRange` returns every Telemetry Sample in a range — 13k–16k for a normal ride, more once zoom keeps full resolution. Returning one `Map` of ~25 fields per sample meant ~25 × N per-field crossings: ~2.3 s of `await` for a ~1 s native read, i.e. ~1.3 s of pure marshaling. The numeric payload was only a few MB — the cost was per-field object construction, not bytes.

## Decision

When a native→JS read's size scales with row/sample count, it crosses the bridge as a **binary buffer**, not an array of objects:

1. Pack each row as a fixed set of numeric lanes, row-major, into one direct `ByteBuffer` (little-endian), and return it as a `NativeArrayBuffer` (a single zero-copy transfer).
2. Carry a small header alongside the buffer: row count, lane layout, and a **dictionary** for any string fields (strings can't live in a numeric lane; a per-row index lane points into it).
3. Use a sentinel for nullable numeric lanes (`NaN` for floats).
4. Decode back into the domain object shape in the JS module wrapper, so the public API and all consumers stay unchanged.

The instantiating case is `smoothedSampleColumns` in `TelemetryRepository.kt` (25 `Float64` lanes/sample, deviceId/deviceName dictionary) decoded by `decodeBoardSamples` in `vescape-core/src/index.ts`. The same per-row work as before — SoC median smoothing (ADR-0016), unit scaling — only the transport changed.

Small, bounded results stay as object maps. In the same range read, GPS Samples, markers, and exclusions (hundreds of rows) are left as maps; only the count-scaling payload goes binary. Reach for a buffer when size tracks row count, not by default.

## Consequences

- `fields × rows` per-field JSI conversions collapse to one memcpy. Bridge time drops to near the native read floor; JS decode is tens of ms.
- The native encoder and JS decoder share a **lane order and count** by convention only (e.g. `SAMPLE_COLUMN_COUNT` on both sides). Adding or reordering a lane means editing both, in the same order, or the decode silently misreads. Keep the two lists adjacent in review.
- Buffers are little-endian and assume the JS runtime reads typed arrays little-endian (true on the ARM/x86 targets we ship). Revisit if that changes.
- Integer-ish fields packed in `f64` are safe while values stay under 2^53; row `id`s are the ones to watch over a table's lifetime.
- Decoders must tolerate an empty result (count 0 / no buffer) so stubbed or empty platforms return `[]` without a real buffer — e.g. the iOS `getHistoryRange` stub.

## Considered Options

- **Keep array-of-objects, optimize the Kotlin `Map` building.** Rejected: the dominant cost is JSI per-field conversion downstream of the Map, not Map allocation. Caps out at a small constant factor.
- **Structure-of-arrays via `DoubleArray` per field.** Rejected: Expo converts `DoubleArray` element-by-element into a JS `WritableArray` (`pushDouble` per element), not a bulk-copied typed array — drops the string keys but not the per-element crossings. Only a `NativeArrayBuffer` is a true single transfer.
- **Encode as a `ByteArray` / base64 string.** Rejected: Expo routes `ByteArray` through a folly-dynamic string converter, not a zero-copy ArrayBuffer.
- **Stream rows in chunked bridge events with a progress bar.** Deferred: chunking array-of-objects just spreads the same marshaling cost over time. Only worth it if a single buffer load ever exceeds ~1.5 s; revisit then, with typed-array chunks.
- **Downsample persisted data on read.** Rejected for history: future zoom needs full-resolution samples.
