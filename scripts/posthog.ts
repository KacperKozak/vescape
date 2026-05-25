#!/usr/bin/env bun

type QueryResponse = {
  columns?: string[]
  results?: unknown[][]
  error?: string
  detail?: string
}

const DIAGNOSTIC_EVENTS = [
  'app_setting_corrupt',
  'ble_connect_failed',
  'ble_disconnected_unexpectedly',
  'config_decode_failed',
  'config_read_failed',
  'diagnostic_test',
  'profile_push_failed',
  'telemetry_parse_failed',
  'telemetry_stale',
  'telemetry_unavailable',
  'ui_error',
]

function usage(exitCode = 1): never {
  console.error(`PostHog diagnostic query helper

Required env:
  POSTHOG_PERSONAL_API_KEY  Personal API key with query:read scope.
  POSTHOG_PROJECT_ID        PostHog project id.

Optional env:
  POSTHOG_HOST              Private API host. Default: https://us.posthog.com

Commands:
  bun run posthog:recent [limit] [hours]
  bun run posthog:events [days]
  bun run posthog:distinct <distinct_id> [limit]
  bun run posthog:query "select event, timestamp from events limit 5"
  cat query.sql | bun run posthog:query
`)
  process.exit(exitCode)
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing ${name}.`)
    usage()
  }
  return value
}

function privateHost(): string {
  const configured =
    process.env.POSTHOG_HOST?.trim() ||
    process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() ||
    'https://us.posthog.com'
  const withProtocol = configured.startsWith('http') ? configured : `https://${configured}`
  return withProtocol
    .replace('://us.i.posthog.com', '://us.posthog.com')
    .replace('://eu.i.posthog.com', '://eu.posthog.com')
    .replace(/\/+$/, '')
}

function integerArg(value: string | undefined, fallback: number, name: string): number {
  if (value == null) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be positive integer, got ${value}`)
  }
  return parsed
}

function quote(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
}

async function readSql(args: string[]): Promise<string> {
  const inline = args.join(' ').trim()
  if (inline) return inline
  if (process.stdin.isTTY) usage()
  return (await Bun.stdin.text()).trim()
}

function diagnosticEventList(): string {
  return DIAGNOSTIC_EVENTS.map(quote).join(', ')
}

async function runQuery(sql: string, name: string): Promise<QueryResponse> {
  const token = requiredEnv('POSTHOG_PERSONAL_API_KEY')
  const projectId = requiredEnv('POSTHOG_PROJECT_ID')
  const url = `${privateHost()}/api/projects/${projectId}/query/`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      query: {
        kind: 'HogQLQuery',
        query: sql,
      },
    }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`PostHog ${response.status}: ${JSON.stringify(body)}`)
  }
  return body as QueryResponse
}

function printRows(response: QueryResponse): void {
  const { columns, results } = response
  if (!columns || !Array.isArray(results)) {
    console.log(JSON.stringify(response, null, 2))
    return
  }
  const rows = results.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index]])),
  )
  console.log(JSON.stringify(rows, null, 2))
}

async function main(): Promise<void> {
  const [command = 'recent', ...args] = Bun.argv.slice(2)
  let sql: string
  let name: string

  switch (command) {
    case 'recent': {
      const limit = integerArg(args[0], 25, 'limit')
      const hours = integerArg(args[1], 48, 'hours')
      name = `vesc recent diagnostics ${hours}h`
      sql = `
        select
          timestamp,
          event,
          distinct_id,
          properties.operation as operation,
          properties.source as source,
          properties.phase as phase,
          properties.error_code as error_code,
          properties.message as message,
          properties.app_version as app_version
        from events
        where event in (${diagnosticEventList()})
          and timestamp >= now() - interval ${hours} hour
        order by timestamp desc
        limit ${limit}
      `
      break
    }
    case 'events': {
      const days = integerArg(args[0], 14, 'days')
      name = `vesc diagnostic event counts ${days}d`
      sql = `
        select event, count() as count, max(timestamp) as last_seen
        from events
        where event in (${diagnosticEventList()})
          and timestamp >= now() - interval ${days} day
        group by event
        order by last_seen desc
      `
      break
    }
    case 'distinct': {
      const distinctId = args[0]?.trim()
      if (!distinctId) usage()
      const limit = integerArg(args[1], 25, 'limit')
      name = `vesc diagnostics distinct ${distinctId}`
      sql = `
        select timestamp, event, properties.operation as operation, properties.message as message, properties
        from events
        where distinct_id = ${quote(distinctId)}
          and event in (${diagnosticEventList()})
        order by timestamp desc
        limit ${limit}
      `
      break
    }
    case 'query': {
      sql = await readSql(args)
      name = 'vesc ad hoc agent query'
      break
    }
    case 'help':
    case '--help':
    case '-h':
      usage(0)
    default:
      throw new Error(`Unknown command: ${command}`)
  }

  printRows(await runQuery(sql, name))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
