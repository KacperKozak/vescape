import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ReleaseManifest, WorkflowRun } from './contracts'
import { parseReleaseManifest } from './contracts'

const WORKFLOW_FILE = 'release-android.yml'

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

export function createDispatchPayload(sourceSha: string, requestId: string): DispatchPayload {
  if (!/^[0-9a-f]{40}$/i.test(sourceSha))
    throw new Error('Source SHA must be a full 40-character SHA')
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Request ID must be a UUID')
  return { ref: 'main', inputs: { source_sha: sourceSha.toLowerCase(), request_id: requestId } }
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

export async function getWorkflowRun(repo: string, runId: number): Promise<WorkflowRun> {
  const output = await checkedGh(
    ['api', `repos/${repo}/actions/runs/${runId}`],
    'Cannot read workflow run',
  )
  return JSON.parse(output) as WorkflowRun
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

export async function retryFailedJobs(runId: number): Promise<void> {
  await checkedGh(['run', 'rerun', String(runId), '--failed'], 'Cannot retry failed jobs')
}
