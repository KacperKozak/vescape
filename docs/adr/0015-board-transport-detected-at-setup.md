# Board Transport Detected at Setup, Not at Connect

A Board's **Board Link** is resolved by an explicit **Board Probe** and stored on the Board. The runtime connect path no longer discovers transport: it reads the stored Board Link and connects. A Board without a Board Link cannot establish a Board Session and is routed to probing first.

Board Probe confirms a link only when a BLE peripheral yields at least one successfully-decoded Refloat Telemetry Sample over a Board Transport — a live GATT connection is not sufficient. When more than one transport yields valid telemetry (multi-controller CAN bus), probing presents the candidates and the user picks; the first valid candidate is pre-selected.

This moves all CAN-ping discovery, fallback, and timeout logic out of the runtime hot path and into the detection flow, leaving connect deterministic and fast.

## Considered Options

- **Auto-capture on first connect.** First connection runs discovery inline, stores the result, and every subsequent connect is dumb. Rejected because discovery logic still lives in the runtime path (just gated), so the runtime never becomes truly simple, and the resolution is implicit rather than a verified, user-visible step.
- **Optional detection + runtime fallback.** Detection as a convenience while runtime keeps full discovery as fallback. Rejected because the runtime stays complex — the duplicate discovery path can never be deleted.
- **Tri-state transport enum (`unknown | direct | can(id)`).** Rejected in favour of a nullable field where null means undetected; a persisted `unknown` behaves identically to absence.
- **Separate BLE id and Board Transport fields.** Rejected because it permits partial saved state: a Board can have a BLE peripheral but no proven telemetry path. A Board Link is saved whole or not at all.
- **Save the Board before probing in Add Board.** Rejected because a mistaken BLE selection would only fail after the rider completes naming and battery setup. Probing immediately after BLE selection validates the chosen peripheral before the rest of the wizard.

## Consequences

- The runtime connect path drops CAN-ping send, `armCanPingTimeout`/`shouldCanPingFallback`, the `canId == null` discovery branch, and `can_ping_*` Diagnostic Events. That logic relocates to a native Board Probe mode invoked by an explicit intent.
- Board creation stays offline-completable, but a linked Board must have a complete Board Link. A Board with no Board Link cannot start a Board Session.
- Add Board runs Board Probe immediately after BLE peripheral selection. A failed probe does not save the BLE id. A successful probe produces a draft Board Link that is saved with the new Board later in the wizard.
- Existing Boards keep their Board identity and related data, but missing Board Link means unlinked; the rider can re-link by running Board Probe.
- Probing is reachable from three entry points: during Add Board after BLE selection, auto-routed when connecting a Board without a Board Link, and re-runnable from Edit Board as a first-class Board Link action.
- Re-linking (re-probing an existing Board Link) leaves the stored Board Link intact while it runs and replaces it atomically only when the rider saves a confirmed transport. A cancelled or failed re-link keeps the prior link — looking is non-destructive. (Amends the original "clears the link when it starts" rule, which destroyed a working link merely by opening the screen.) Because a Board Session owns a single BLE connection, re-linking a connected Board tears down the live session first.
- A stale Board Link (board rewired, CAN id reassigned, BLE module replaced) is not self-healed at runtime. The rider re-runs Board Probe manually.
- Board Probe that finds no working transport stores nothing and surfaces progress plus failure details for retry/debugging.
