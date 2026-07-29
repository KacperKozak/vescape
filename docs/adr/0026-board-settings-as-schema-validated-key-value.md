# Board Settings are schema-validated key-value, not board columns

Adding a per-Board preference used to mean a new column on the boards table with migrations and normalize paths on both platforms — enough friction that per-board settings were avoided. Last call before release is the cheapest moment for a bigger schema reshape.

Decided: rider-adjustable per-Board preferences and soft state live in a `board_settings` key-value table (`board_id`, `key`, JSON `value`), mirroring the global settings mechanism. Existing prefs (`batteryConfig`, `lastBattery`, `dismissedWarnings`, `description`) move there; alert preset levels, Board Top Speed, and alert onboarding land there directly. Board identity and probe-confirmed facts (`id`, `name`, `createdAt`, `link`) stay typed columns — the split is Board Setting (prefs, schemaless) vs Board fact (structured, queried).

Values are schema-validated on read, not trusted: each key has a normalizer, and a value that no longer parses is dropped (falls back to default) rather than crashing the app. Backwards compatibility is best-effort and prioritized for important settings (e.g. battery config); unrecognized or invalid keys are safe to discard.
