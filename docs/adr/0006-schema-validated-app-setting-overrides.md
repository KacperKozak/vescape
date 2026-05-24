# Schema-validated App Setting overrides

App Settings persist as schema-validated key-value overrides in `app_settings`, with defaults owned by native code and returned when no valid override exists. This avoids a Room migration for every Setting page addition or rename during the PoC, while keeping native in charge of durable truth and foreground-service reads.

## Consequences

- Migrating to this shape wipes only old App Settings; telemetry, boards, alerts, and Tune Profiles are preserved.
- Writing a value equal to its default deletes the override row.
- Missing, invalid, or corrupt values fall back to the schema default; invalid persisted rows are deleted and reported as Diagnostic Events.
- The Settings page remains hand-built; the schema validates storage and provides canonical defaults rather than generating UI.
