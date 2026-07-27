# Telemetry Is Keyed on Board Id, Not on the BLE Identifier

`telemetry_frames` and `telemetry_minute_buckets` key on `board_id` and no longer carry `device_id` (the BLE identifier) or `device_name` (the **Board** name denormalized at capture time). The Board id is already known at capture — `SessionConfig` carries `appBoardId` alongside `deviceId` — it simply was not written down. Board names on **Ride History** are resolved by looking the Board up by id. Resolves issue #274.

The BLE identifier was never an identity. It is nullable, it moves when a Board is re-linked to a different peripheral, and two different peripherals over a Board's lifetime produced two unjoinable halves of one Board's history. The denormalized name existed to survive that, and to survive Board deletion — but ADR-0027 makes Boards tombstones that never disappear, so the lookup always resolves and the reason for the copy is gone.

The decisive argument came from backup. The server stores frames and buckets keyed on `boardId` and does not accept `deviceId` or `deviceName` for them, so the denormalized name is data that is never backed up. Keeping it would mean a restored app resolves history labels by lookup while the app that made the backup reads a column — two label sources, where the one that must work is the one the column does not feed.

`telemetry_markers`, `diagnostic_events` and `metric_exclusion_ranges` are unchanged: they keep `device_id` and `device_name`, because that is what crosses the wire for them and they are low-cardinality display rows, not a per-sample cost.

## Consequences

- Migration adds `board_id`, backfilled by matching `boards.ble_id` to `device_id`, then drops both columns. Minute buckets move their primary key from `(bucket_start_ms, device_id)` to `(bucket_start_ms, board_id)`, which is what the server already uses.
- Rows that backfill to no Board — telemetry from Boards hard-deleted before ADR-0027, or whose BLE identifier moved on a re-link — would otherwise lose both their identity and their label. The migration mints one tombstoned Board per unresolved `device_id`, named from the historical `device_name`, so the history keeps a label, stays joinable, and can be backed up. A tombstoned Board never appears in the Rider's Board list.
- Renaming a Board now retroactively relabels its **Ride History**. Previously history kept the name the Board carried at ride time. This is the intended reading: it is the same Board.
- Read paths resolve the Board name by lookup rather than reading it off the sample row. Permitted by ADR-0005, whose "no reconstruction on read" rule is about replaying raw **Telemetry Samples**, not about bounded configuration lookups.
- Query keys that meant "this Board" while saying `device_id` now say `board_id` — the bucket key, and the frame and bucket range reads.
