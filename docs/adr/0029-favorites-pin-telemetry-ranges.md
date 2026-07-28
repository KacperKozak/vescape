# Favorites pin telemetry ranges

A Favorite is a durable, optionally named time range `[startMs, endMs]` over telemetry history, stored in a native table in the telemetry DB on both platforms. It is not a pointer to a ride: history sessions are derived on read (ADR 0004/0005) and have no stable identity, while a time range survives regrouping and allows multiple Favorites per ride, including trimmed sub-ranges selected on the ride timeline.

## Contract

- Favorites live in a native table (`@parity` iOS/Android) so telemetry deletion paths can see them.
- A Favorite has a native-minted stable UUID plus native-owned `created_at` and `updated_at`; JS cannot supply them.
- Favorites land independently from backup. The later sync migration adds and backfills `sync_seq`, registers the table with the shared sequence, and switches subsequent writes to the shared Change Timestamp ratchet.
- `deleteTelemetryRange` and `clearTelemetryHistory` carve out favorited ranges instead of deleting them. Deleting a ride around a Favorite leaves the favorited samples as a telemetry island, which history grouping surfaces as a short standalone ride.
- Rides containing a favorited range are marked in history as not fully deletable.
- Removing a Favorite only unpins: its telemetry stays and becomes deletable like any ride. Its Favorite Media is deleted with it.
- Summary stats (mirroring history session summary fields) are computed once from raw samples at creation time and denormalized onto the row (ADR 0005 style); the route preview is derived on read from pinned samples.

## Considered Options

- **Favorite references a session id.** Rejected: session ids are synthesized by grouping and unstable.
- **Cascade delete favorites with their ride.** Rejected: starring means "keep this"; deletion silently destroying favorites betrays that intent.
- **JS-side favorite store passing protected ranges into native deletes.** Rejected: native truth would depend on JS remembering to send it.
- **Delete pinned telemetry when its Favorite is removed.** Rejected: unfavoriting silently destroying telemetry is surprising; unpin-only keeps one rule.

## Consequences

- Delete paths need range-hole support; history grouping already tolerates gaps.
- Sync can adopt Favorites without changing their domain identity; adding the transport-only cursor is a routine additive migration.
- Favorited telemetry is exempt from any future retention pruning.
- Orphan favorite islands appear in History after surrounding-ride deletion; this is accepted as honest.
