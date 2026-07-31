import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PromotionManifest, ReleaseManifest, WorkflowRun } from './contracts'
import { parsePromotionManifest, parseReleaseManifest } from './contracts'

const WORKFLOW_FILE = 'release-android.yml'
const PROMOTION_WORKFLOW_FILE = 'promote-open.yml'

interface GhResult {
  exitCode: number
  stdout: string
  stderr: string
}

async function gh(args: string[]): Promise<GhResult> {
  const process = Bun.spawn(['gh', ...args], { stdout: 'pipe', stderr: 'pipe' })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() }
}

async function checkedGh(args: string[], label: string): Promise<string> {
  const result = await gh(args)
  if (result.exitCode !== 0) throw new Error(`${label}: ${result.stderr || result.stdout}`)
  return result.stdout
}

export interface DispatchPayload {
  ref: 'main'
  inputs: {
    source_sha: string
    request_id: string
  }
}

export interface PromotionDispatchPayload {
  ref: 'main'
  inputs: {
    request_id: string
    candidate_run_id: string
    source_sha: string
    marketing_version: string
    phone_code: string
    wear_code: string
  }
}

export interface ReleaseTrackConfig {
  phoneInternal: string
  phoneOpen: string
  wearInternal: string
  wearOpen: string
}

interface ActionsArtifact {
  name: string
  expired: boolean
  workflow_run?: { id?: number }
}

interface WorkflowJob {
  name: string
  conclusion: string | null
}

export function createDispatchPayload(sourceSha: string, requestId: string): DispatchPayload {
  if (!/^[0-9a-f]{40}$/i.test(sourceSha))
    throw new Error('Source SHA must be a full 40-character SHA')
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Request ID must be a UUID')
  return { ref: 'main', inputs: { source_sha: sourceSha.toLowerCase(), request_id: requestId } }
}

export function createPromotionDispatchPayload(
  manifest: ReleaseManifest,
  requestId: string,
): PromotionDispatchPayload {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Request ID must be a UUID')
  if (!/^[0-9a-f]{40}$/i.test(manifest.sourceSha))
    throw new Error('Candidate source SHA must be a full 40-character SHA')
  if (manifest.uploads.phone !== 'succeeded' || manifest.uploads.wear !== 'succeeded')
    throw new Error('Candidate must have both successful internal uploads')
  return {
    ref: 'main',
    inputs: {
      request_id: requestId,
      candidate_run_id: String(manifest.workflow.runId),
      source_sha: manifest.sourceSha.toLowerCase(),
      marketing_version: manifest.marketingVersion,
      phone_code: String(manifest.versionCodes.phone),
      wear_code: String(manifest.versionCodes.wear),
    },
  }
}

export async function verifyGhAuthentication(): Promise<void> {
  await checkedGh(['auth', 'status'], 'GitHub authentication failed')
}

export async function repositoryName(): Promise<string> {
  const value = await checkedGh(
    ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
    'Cannot resolve repository',
  )
  if (!/^[^/]+\/[^/]+$/.test(value)) throw new Error(`Invalid GitHub repository "${value}"`)
  return value
}

export async function resolveSourceSha(ref: string): Promise<string> {
  const process = Bun.spawn(['git', 'rev-parse', '--verify', `${ref}^{commit}`], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ])
  if (exitCode !== 0) throw new Error(`Cannot resolve commit "${ref}": ${stderr.trim()}`)
  return stdout.trim().toLowerCase()
}

export async function verifyRemoteCommit(repo: string, sourceSha: string): Promise<void> {
  await checkedGh(
    ['api', `repos/${repo}/commits/${sourceSha}`, '--silent'],
    'Commit is not available on GitHub',
  )
}

export async function marketingVersion(repo: string, sourceSha: string): Promise<string> {
  const encodedPath = encodeURIComponent('package.json')
  const content = await checkedGh(
    ['api', `repos/${repo}/contents/${encodedPath}?ref=${sourceSha}`, '--jq', '.content'],
    'Cannot read package.json at source commit',
  )
  const packageJson = JSON.parse(
    Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf8'),
  ) as {
    version?: unknown
  }
  if (typeof packageJson.version !== 'string') throw new Error('Source package.json has no version')
  return packageJson.version
}

export async function dispatchInternalBuild(repo: string, payload: DispatchPayload): Promise<void> {
  await checkedGh(
    [
      'api',
      '--method',
      'POST',
      `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      '--raw-field',
      `ref=${payload.ref}`,
      '--raw-field',
      `inputs[source_sha]=${payload.inputs.source_sha}`,
      '--raw-field',
      `inputs[request_id]=${payload.inputs.request_id}`,
    ],
    'Workflow dispatch failed',
  )
}

export async function dispatchOpenPromotion(
  repo: string,
  payload: PromotionDispatchPayload,
): Promise<void> {
  await checkedGh(
    [
      'api',
      '--method',
      'POST',
      `repos/${repo}/actions/workflows/${PROMOTION_WORKFLOW_FILE}/dispatches`,
      '--raw-field',
      `ref=${payload.ref}`,
      ...Object.entries(payload.inputs).flatMap(([key, value]) => [
        '--raw-field',
        `inputs[${key}]=${value}`,
      ]),
    ],
    'Open-promotion workflow dispatch failed',
  )
}

export function parseWorkflowRuns(value: unknown, requestId: string): WorkflowRun | null {
  if (!value || typeof value !== 'object') throw new Error('Workflow runs response is invalid')
  const runs = (value as { workflow_runs?: unknown }).workflow_runs
  if (!Array.isArray(runs)) throw new Error('Workflow runs response has no workflow_runs')
  const title = `Internal ${requestId}`
  const match = runs.find(
    (run): run is WorkflowRun =>
      !!run &&
      typeof run === 'object' &&
      (run as WorkflowRun).display_title === title &&
      typeof (run as WorkflowRun).id === 'number',
  )
  return match ?? null
}

export function parsePromotionWorkflowRuns(value: unknown, requestId: string): WorkflowRun | null {
  if (!value || typeof value !== 'object') throw new Error('Workflow runs response is invalid')
  const runs = (value as { workflow_runs?: unknown }).workflow_runs
  if (!Array.isArray(runs)) throw new Error('Workflow runs response has no workflow_runs')
  const title = `Open ${requestId}`
  return (
    runs.find(
      (run): run is WorkflowRun =>
        !!run &&
        typeof run === 'object' &&
        (run as WorkflowRun).display_title === title &&
        typeof (run as WorkflowRun).id === 'number',
    ) ?? null
  )
}

export async function findDispatchedRun(
  repo: string,
  requestId: string,
): Promise<WorkflowRun | null> {
  const output = await checkedGh(
    [
      'api',
      `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=50`,
    ],
    'Cannot list workflow runs',
  )
  return parseWorkflowRuns(JSON.parse(output), requestId)
}

export async function findPromotionRun(
  repo: string,
  requestId: string,
): Promise<WorkflowRun | null> {
  const output = await checkedGh(
    [
      'api',
      `repos/${repo}/actions/workflows/${PROMOTION_WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=50`,
    ],
    'Cannot list open-promotion workflow runs',
  )
  return parsePromotionWorkflowRuns(JSON.parse(output), requestId)
}

export async function getWorkflowRun(repo: string, runId: number): Promise<WorkflowRun> {
  const output = await checkedGh(
    ['api', `repos/${repo}/actions/runs/${runId}`],
    'Cannot read workflow run',
  )
  return JSON.parse(output) as WorkflowRun
}

export function parseFailedWorkflowJobs(value: unknown): string[] {
  if (!value || typeof value !== 'object') throw new Error('Workflow jobs response is invalid')
  const jobs = (value as { jobs?: unknown }).jobs
  if (!Array.isArray(jobs)) throw new Error('Workflow jobs response has no jobs')
  return jobs
    .filter(
      (job): job is WorkflowJob =>
        !!job &&
        typeof job === 'object' &&
        typeof (job as WorkflowJob).name === 'string' &&
        (job as WorkflowJob).conclusion !== 'success' &&
        (job as WorkflowJob).conclusion !== 'skipped',
    )
    .map((job) => job.name)
}

export async function failedWorkflowJobs(repo: string, runId: number): Promise<string[]> {
  const output = await checkedGh(
    ['api', `repos/${repo}/actions/runs/${runId}/jobs?filter=latest&per_page=100`],
    'Cannot read workflow jobs',
  )
  return parseFailedWorkflowJobs(JSON.parse(output))
}

export async function downloadManifest(runId: number): Promise<ReleaseManifest> {
  const directory = await mkdtemp(join(tmpdir(), 'vescape-release-'))
  try {
    await checkedGh(
      ['run', 'download', String(runId), '--name', 'release-manifest', '--dir', directory],
      'Cannot download release manifest',
    )
    const contents = await readFile(join(directory, 'release-manifest.json'), 'utf8')
    return parseReleaseManifest(JSON.parse(contents))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export function parseManifestRunIds(value: unknown): number[] {
  if (!value || typeof value !== 'object') throw new Error('Artifacts response is invalid')
  const artifacts = (value as { artifacts?: unknown }).artifacts
  if (!Array.isArray(artifacts)) throw new Error('Artifacts response has no artifacts')
  return [
    ...new Set(
      artifacts
        .filter(
          (artifact): artifact is ActionsArtifact =>
            !!artifact &&
            typeof artifact === 'object' &&
            (artifact as ActionsArtifact).name === 'release-manifest' &&
            (artifact as ActionsArtifact).expired === false &&
            Number.isSafeInteger((artifact as ActionsArtifact).workflow_run?.id),
        )
        .map((artifact) => artifact.workflow_run!.id!),
    ),
  ]
}

export async function listInternalCandidates(repo: string): Promise<ReleaseManifest[]> {
  const output = await checkedGh(
    ['api', `repos/${repo}/actions/artifacts?name=release-manifest&per_page=30`],
    'Cannot list internal release manifests',
  )
  const candidates: ReleaseManifest[] = []
  for (const runId of parseManifestRunIds(JSON.parse(output))) {
    const manifest = await downloadManifest(runId)
    if (manifest.uploads.phone === 'succeeded' && manifest.uploads.wear === 'succeeded') {
      candidates.push(manifest)
    }
  }
  return candidates.sort((left, right) => right.workflow.runId - left.workflow.runId)
}

export function parseTrackConfig(value: unknown): ReleaseTrackConfig {
  const defaults: ReleaseTrackConfig = {
    phoneInternal: 'internal',
    phoneOpen: 'beta',
    wearInternal: 'wear:internal',
    wearOpen: 'wear:beta',
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { variables?: unknown }).variables)
  )
    return defaults
  const entries = (value as { variables: Array<{ name?: unknown; value?: unknown }> }).variables
    .filter(
      (entry): entry is { name: string; value: string } =>
        typeof entry.name === 'string' && typeof entry.value === 'string' && entry.value.length > 0,
    )
    .map((entry) => [entry.name, entry.value] as const)
  const variables = Object.fromEntries(entries)
  return {
    phoneInternal: variables.PLAY_PHONE_INTERNAL_TRACK ?? defaults.phoneInternal,
    phoneOpen: variables.PLAY_PHONE_OPEN_TRACK ?? defaults.phoneOpen,
    wearInternal: variables.PLAY_WEAR_INTERNAL_TRACK ?? defaults.wearInternal,
    wearOpen: variables.PLAY_WEAR_OPEN_TRACK ?? defaults.wearOpen,
  }
}

export async function releaseTrackConfig(repo: string): Promise<ReleaseTrackConfig> {
  const output = await checkedGh(
    ['api', `repos/${repo}/actions/variables?per_page=100`],
    'Cannot read Play track configuration',
  )
  return parseTrackConfig(JSON.parse(output))
}

export async function canonicalNotesPath(repo: string, marketingVersion: string): Promise<string> {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(marketingVersion))
    throw new Error(`Invalid marketing version "${marketingVersion}"`)
  const path = `release-notes/${marketingVersion}.md`
  await checkedGh(
    [
      'api',
      `repos/${repo}/contents/release-notes/${encodeURIComponent(marketingVersion)}.md?ref=main`,
      '--silent',
    ],
    `Canonical release notes missing at ${path} on main`,
  )
  return path
}

export async function downloadPromotionManifest(runId: number): Promise<PromotionManifest> {
  const directory = await mkdtemp(join(tmpdir(), 'vescape-promotion-'))
  try {
    await checkedGh(
      ['run', 'download', String(runId), '--name', 'promotion-manifest', '--dir', directory],
      'Cannot download promotion manifest',
    )
    const contents = await readFile(join(directory, 'promotion-manifest.json'), 'utf8')
    return parsePromotionManifest(JSON.parse(contents))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

export async function retryFailedJobs(runId: number): Promise<void> {
  await checkedGh(retryFailedJobsArgs(runId), 'Cannot retry failed jobs')
}

export function retryFailedJobsArgs(runId: number): string[] {
  if (!Number.isSafeInteger(runId) || runId < 1)
    throw new Error(`Invalid workflow run ID "${runId}"`)
  return ['run', 'rerun', String(runId), '--failed']
}
