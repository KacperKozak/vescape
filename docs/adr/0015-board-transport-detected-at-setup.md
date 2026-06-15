# Board Transport Detected at Setup, Not at Connect

A Board's **Board Transport** (Direct, or CAN-forwarded to a specific CAN id) is resolved once by an explicit detection flow and stored on the Board. The runtime connect path no longer discovers transport: it reads the stored Board Transport and connects. A Board with an undetected (null) transport cannot establish a Board Session and is routed to detection first.

Detection confirms a transport only when it yields at least one successfully-decoded Refloat Telemetry Sample — a live GATT connection is not sufficient. When more than one transport yields valid telemetry (multi-controller CAN bus), detection presents the candidates and the user picks; the first valid candidate is pre-selected.

This moves all CAN-ping discovery, fallback, and timeout logic out of the runtime hot path and into the detection flow, leaving connect deterministic and fast.

## Considered Options

- **Auto-capture on first connect.** First connection runs discovery inline, stores the result, and every subsequent connect is dumb. Rejected because discovery logic still lives in the runtime path (just gated), so the runtime never becomes truly simple, and the resolution is implicit rather than a verified, user-visible step.
- **Optional detection + runtime fallback.** Detection as a convenience while runtime keeps full discovery as fallback. Rejected because the runtime stays complex — the duplicate discovery path can never be deleted.
- **Tri-state transport enum (`unknown | direct | can(id)`).** Rejected in favour of a nullable field where null means undetected; a persisted `unknown` behaves identically to absence.

## Consequences

- The runtime connect path drops CAN-ping send, `armCanPingTimeout`/`shouldCanPingFallback`, the `canId == null` discovery branch, and `can_ping_*` Diagnostic Events. That logic relocates to a native detection mode invoked by an explicit intent.
- Board creation stays offline-completable, but a Board must be detected (board powered and in range) before its first Board Session.
- Existing Boards carry a null Board Transport and are routed to detection on next connect; no data migration is required.
- Detection is reachable from three entry points: offered at the end of the Add Board wizard, auto-routed when connecting a Board with null transport, and re-runnable from Edit Board as a first-class "Board Transport" setting that shows the current value and a Detect / Re-detect action.
- Re-detection overwrites the stored Board Transport. Because a Board Session owns a single BLE connection, re-detecting a connected Board tears down the live session, runs a detection session, then stores the result.
- A stale stored transport (board rewired, CAN id reassigned) is not self-healed at runtime. The dumb runtime keeps retrying — a rewired board and a powered-off board both surface as continuous reconnection — and the rider re-runs detection manually. The existing `board_ready_timeout` Diagnostic Event remains the debugging signal.
- Detection that finds no working transport stores nothing and surfaces a failure for the user to retry.
