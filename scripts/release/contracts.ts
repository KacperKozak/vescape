export type UploadStatus = 'succeeded' | 'failed'

export interface ArtifactIdentity {
  name: string
  sha256: string
  signingCertificateSha256: string
}

export interface ReleaseManifest {
  schemaVersion: 1
  requestId: string
  sourceSha: string
  marketingVersion: string
  versionCodes: {
    phone: number
    wear: number
  }
  workflow: {
    runId: number
    runUrl: string
    runAttempt: number
  }
  artifacts: {
    phone: ArtifactIdentity
    wear: ArtifactIdentity
  }
  uploads: {
    phone: UploadStatus
    wear: UploadStatus
  }
}

export interface WorkflowRun {
  id: number
  html_url: string
  display_title: string
  status: 'queued' | 'in_progress' | 'completed' | 'waiting' | 'requested' | 'pending'
  conclusion: string | null
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  if (!value || typeof value !== 'object') throw new Error('Release manifest is not an object')
  const manifest = value as Partial<ReleaseManifest>
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.requestId !== 'string' ||
    typeof manifest.sourceSha !== 'string' ||
    typeof manifest.marketingVersion !== 'string' ||
    !manifest.versionCodes ||
    typeof manifest.versionCodes.phone !== 'number' ||
    typeof manifest.versionCodes.wear !== 'number' ||
    !manifest.workflow ||
    typeof manifest.workflow.runId !== 'number' ||
    typeof manifest.workflow.runUrl !== 'string' ||
    !manifest.artifacts?.phone ||
    !manifest.artifacts.wear ||
    !manifest.uploads ||
    !['succeeded', 'failed'].includes(manifest.uploads.phone ?? '') ||
    !['succeeded', 'failed'].includes(manifest.uploads.wear ?? '')
  ) {
    throw new Error('Release manifest has an invalid shape')
  }
  return manifest as ReleaseManifest
}

export type ReleaseOutcome =
  | { kind: 'success' }
  | { kind: 'failure' }
  | { kind: 'partial'; succeeded: 'phone' | 'wear'; failed: 'phone' | 'wear' }

export function releaseOutcome(manifest: ReleaseManifest): ReleaseOutcome {
  const { phone, wear } = manifest.uploads
  if (phone === 'succeeded' && wear === 'succeeded') return { kind: 'success' }
  if (phone === wear) return { kind: 'failure' }
  return phone === 'succeeded'
    ? { kind: 'partial', succeeded: 'phone', failed: 'wear' }
    : { kind: 'partial', succeeded: 'wear', failed: 'phone' }
}

export function retryFailedJobsArgs(manifest: ReleaseManifest): string[] | null {
  return releaseOutcome(manifest).kind === 'success'
    ? null
    : ['run', 'rerun', String(manifest.workflow.runId), '--failed']
}
