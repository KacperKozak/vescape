# Legal Policy is app-wide; Legal Mode is per-Board native state

The bundled Legal Policy catalog is one shared data source consumed by JS, Android, and iOS. Native resolves the phone's country from the first usable GPS fix when no jurisdiction is saved and persists only the country code as the app-wide Legal Policy reference; later location changes do nothing unless the rider explicitly refreshes. JS reads the same catalog and persisted settings for presentation, but does not resolve jurisdiction or orchestrate behavior.

Legal Mode is durable per-Board state stored as `legalMode: { enabled }`. JS changes it only through a dedicated native intent. Enabling requires a resolved Legal Policy, a live Board Session, and trusted link integrity; disabling is always allowed. The state survives disconnects and app restarts until explicitly disabled.

Native derives the effective policy from the saved country code and shared catalog, then adds Legal Mode's non-persisted speed warning to the alert evaluator for the connected Board. No policy snapshot or Legal Mode Alert Rule row is stored. This keeps future Board config constraints and restoration inside the same native intent instead of moving orchestration into JS.
