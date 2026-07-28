# Map Point reactions use Clerk user ids directly

Map Point identity stays simple while the feature is local-only. The app does not copy Clerk
accounts into SQLite and does not implement a synchronization queue.

`map_points.author_id` stores the Clerk user id that created the point.

`map_point_reactions` stores one `up` or `down` reaction for one Clerk user and one Map Point. Its
primary key is `(clerk_user_id, map_point_id)`. Changing a reaction updates that row. Removing a
reaction deletes the row. The displayed score is calculated from all local reaction rows.

The active Clerk user id is held only in volatile JavaScript state and is passed explicitly across
the native bridge for reads and writes. Passwords, tokens, profile copies, pending states, server
scores, and tombstones are not stored in these tables.

Creating, editing, deleting, and reacting require Clerk sign-in. Native code also checks the passed
Clerk id, and only the matching `author_id` may edit or delete a community Map Point. The local
direction/navigation point remains independent from account identity.

All Map Point additions on the feature branch still ship in one database upgrade from version 27 to 28. A future server implementation can keep these Clerk ids as identity keys, but server sync,
conflict handling, aggregate scores, deletion tombstones, and media upload need a separate design and
migration when that work starts.
