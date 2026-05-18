# Tune profiles store semantic values and sync via read-before-write

Tune Profiles persist all ~50 Refloat tune fields as semantic (human-meaningful) values in Room DB, decoupled from the board's firmware schema. The XML schema is used only at the BLE boundary to encode/decode between semantic values and the board's binary config blob. Writing to the board always requires a fresh read of the full config blob first, patching only known tune fields and preserving all unknown bytes — this is safety-critical on a balance vehicle where corrupting non-tune fields could cause dangerous behavior.

## Considered Options

- **Store raw bytes / schema-bound values.** Rejected because firmware updates change field encoding (e.g., ATR strength scaled 10x in Refloat 1.2). Semantic storage means a profile saved on one firmware version applies correctly to another without conversion tables.
- **Allow partial config writes.** Rejected because the board config blob contains motor, hardware, and app settings beyond the ~50 tune fields. A partial write would zero or corrupt unknown fields. Full-blob read-patch-write is the only safe path.
- **Store profiles in JS land (AsyncStorage / expo-sqlite).** Rejected to maintain the project's architecture principle: native owns durable truth. Room DB alongside existing telemetry tables, exposed to JS via Expo module intents.

## Consequences

- Every board write requires a live BLE connection — offline edits stay local until sync.
- Round-trip correctness (`encode(decode(blob))` preserves untouched bytes) must be verified with thorough tests before the write path ships.
- History entries are append-only snapshots captured before each explicit profile save, enabling rollback to any prior state. No history is created for reads, connects, or pushes.
