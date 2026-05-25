# PostHog Agent Debugging

Use `scripts/posthog.ts` when debugging native diagnostic events captured by PostHog.

## Setup

Keep credentials in `.env.local`:

```sh
POSTHOG_PERSONAL_API_KEY=phx_...
POSTHOG_PROJECT_ID=...
POSTHOG_HOST=https://us.posthog.com
```

`POSTHOG_PERSONAL_API_KEY` must be a personal API key with `query:read` scope. Do not use the public `EXPO_PUBLIC_POSTHOG_API_KEY` for private queries.

PostHog uses different hosts for ingestion and private APIs. App builds use `https://us.i.posthog.com`; agent queries use `https://us.posthog.com`. The script maps `us.i` and `eu.i` hosts to private API hosts if needed.

## Commands

```sh
bun run posthog:recent
bun run posthog:recent 50 12
bun run posthog:events 30
bun run posthog:distinct android-...
bun run posthog:query "select event, timestamp from events order by timestamp desc limit 5"
```

Pipe larger HogQL:

```sh
cat tmp/query.sql | bun run posthog:query
```

All commands print JSON rows so agents can inspect, filter, or paste into bug notes.

## Diagnostic Events

Tracked app event names:

- `app_setting_corrupt`
- `ble_connect_failed`
- `ble_disconnected_unexpectedly`
- `config_decode_failed`
- `config_read_failed`
- `diagnostic_test`
- `profile_push_failed`
- `telemetry_parse_failed`
- `telemetry_stale`
- `telemetry_unavailable`
- `ui_error`

Useful columns: `timestamp`, `event`, `distinct_id`, `properties.operation`, `properties.source`, `properties.phase`, `properties.error_code`, `properties.message`, `properties.app_version`.

## App Check

Open Settings -> Dev -> Diagnostics in the app. Send native and UI diagnostic test events. Then run:

```sh
bun run posthog:recent 10 1
```

If no rows appear, check app build env for `EXPO_PUBLIC_POSTHOG_API_KEY`, then check agent env for `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID`.
