# Legal Mode is a native overlay, not materialized Alert Rules

Legal Mode used to work by JS writing a synthetic Alert Rule row (`legal-mode-speed-alert`, `source: 'legal-mode'`) into the alerts table and regenerating it on every setting change. With Alert Rules becoming per-Board, that design would force a jurisdiction-wide concept to pick a board or require nullable board scoping.

Decided: Legal Mode is a natively persisted App Setting that the native alert engine reads directly. When enabled, the engine synthesizes a virtual speed rule in memory at rule-load time and evaluates it alongside the connected Board's own Alert Rules. Nothing is ever written to the alerts table; the `legal-mode` rule source, the fixed rule id, and the JS regeneration flow are removed, and `alerts.board_id` stays NOT NULL.

The setting must persist natively (not just in JS) because alert enforcement runs with JS dead, and a future "revert overridden board settings when Legal Mode turns off" needs durable pre-override state even across app kills and reconnects.
