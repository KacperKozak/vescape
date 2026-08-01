import { parseMarketingVersion } from '../../src/modules/release/lib/releaseNotes'

export interface PublishedRelease {
  tagName: string
  name: string
  publishedAt: string
}

export interface ReleaseNotePlan {
  repo: string
  targetSha: string
  targetRef: string
  marketingVersion: string
  previous: (PublishedRelease & { sha: string }) | null
  comparison: string
  diffBase: string
}

interface CommandResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function command(program: string, args: string[]): Promise<CommandResult> {
  const child = Bun.spawn([program, ...args], { cwd: joinRoot(), stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}

function joinRoot(): string {
  return new URL('../..', import.meta.url).pathname.replace(/\/$/, '')
}

async function checked(program: string, args: string[], label: string): Promise<string> {
  const result = await command(program, args)
  if (result.exitCode !== 0) throw new Error(`${label}: ${result.stderr || result.stdout}`)
  return result.stdout
}

export function parsePublishedReleases(value: unknown): PublishedRelease[] {
  if (!Array.isArray(value)) throw new Error('GitHub releases response is invalid')
  return value
    .filter(
      (release): release is Record<string, unknown> =>
        !!release &&
        typeof release === 'object' &&
        release.draft === false &&
        release.prerelease === false &&
        typeof release.tag_name === 'string' &&
        typeof release.published_at === 'string',
    )
    .map((release) => ({
      tagName: release.tag_name as string,
      name:
        typeof release.name === 'string' && release.name
          ? release.name
          : (release.tag_name as string),
      publishedAt: release.published_at as string,
    }))
    .toSorted((left, right) => right.publishedAt.localeCompare(left.publishedAt))
}

export function parseHistoricalProductionTags(value: string): PublishedRelease[] {
  return value
    .split('\n')
    .map((tagName) => tagName.trim())
    .filter(Boolean)
    .flatMap((tagName) => {
      const match = /^production-(\d+\.\d+\.\d+)$/.exec(tagName)
      return match ? [{ tagName, name: match[1], publishedAt: '' }] : []
    })
}

export async function resolveReleaseNotePlan(
  targetRef: string,
  versionOverride?: string,
): Promise<ReleaseNotePlan> {
  const repo = await checked(
    'gh',
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    'Cannot resolve repository',
  )
  const targetSha = (
    await checked(
      'git',
      ['rev-parse', '--verify', `${targetRef}^{commit}`],
      'Cannot resolve target',
    )
  ).toLowerCase()
  const packageJson = JSON.parse(
    await checked('git', ['show', `${targetSha}:package.json`], 'Cannot read target package.json'),
  ) as { version?: unknown }
  const marketingVersion = versionOverride ?? packageJson.version
  if (typeof marketingVersion !== 'string' || !parseMarketingVersion(marketingVersion)) {
    throw new Error(`Invalid marketing version "${String(marketingVersion)}"`)
  }

  const response = await checked(
    'gh',
    ['api', `repos/${repo}/releases?per_page=100`],
    'Cannot list published releases',
  )
  const releases = parsePublishedReleases(JSON.parse(response))
  const historicalTags = parseHistoricalProductionTags(
    await checked(
      'git',
      ['tag', '--list', 'production-*', '--sort=-version:refname'],
      'Cannot list historical production tags',
    ),
  )
  const candidates = [...releases, ...historicalTags].filter(
    (candidate, index, all) =>
      all.findIndex((other) => other.tagName === candidate.tagName) === index,
  )
  let previous: ReleaseNotePlan['previous'] = null
  let previousDistance = Number.POSITIVE_INFINITY
  for (const release of candidates) {
    const resolved = await command('git', ['rev-parse', '--verify', `${release.tagName}^{commit}`])
    if (resolved.exitCode !== 0) continue
    const sha = resolved.stdout.toLowerCase()
    if (sha === targetSha) continue
    const ancestor = await command('git', ['merge-base', '--is-ancestor', sha, targetSha])
    if (ancestor.exitCode !== 0) continue
    const distanceResult = await command('git', ['rev-list', '--count', `${sha}..${targetSha}`])
    const distance = Number(distanceResult.stdout)
    if (
      distanceResult.exitCode === 0 &&
      Number.isSafeInteger(distance) &&
      distance < previousDistance
    ) {
      previous = { ...release, sha }
      previousDistance = distance
    }
  }

  const diffBase = previous
    ? previous.sha
    : await checked('git', ['hash-object', '-t', 'tree', '/dev/null'], 'Cannot create empty tree')
  return {
    repo,
    targetSha,
    targetRef,
    marketingVersion,
    previous,
    comparison: previous ? `${previous.tagName}..${targetSha}` : `<beginning>..${targetSha}`,
    diffBase,
  }
}
