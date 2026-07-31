import { describe, expect, test } from 'bun:test'
import {
  createDispatchPayload,
  createPromotionDispatchPayload,
  parseManifestRunIds,
  parsePromotionWorkflowRuns,
  parseTrackConfig,
  parseFailedWorkflowJobs,
  parseWorkflowRuns,
  retryFailedJobsArgs,
} from './github'

describe('release workflow dispatch', () => {
  test('pins the trusted definition to main and passes source separately', () => {
    const sha = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01'
    const requestId = '7f787fe8-4a30-4fcf-a3b1-4a9dd8606e38'
    expect(createDispatchPayload(sha, requestId)).toEqual({
      ref: 'main',
      inputs: { source_sha: sha.toLowerCase(), request_id: requestId },
    })
  })

  test('correlates the exact structured run title', () => {
    const requestId = '7f787fe8-4a30-4fcf-a3b1-4a9dd8606e38'
    const run = {
      id: 302,
      html_url: 'https://example.test/run/302',
      display_title: `Internal ${requestId}`,
      status: 'queued' as const,
      conclusion: null,
    }
    expect(
      parseWorkflowRuns(
        { workflow_runs: [{ ...run, id: 1, display_title: 'other' }, run] },
        requestId,
      ),
    ).toEqual(run)
  })

  test('names failed jobs from the structured workflow result', () => {
    expect(
      parseFailedWorkflowJobs({
        jobs: [
          { name: 'Release gates', conclusion: 'failure' },
          { name: 'Build signed artifacts once', conclusion: 'skipped' },
          { name: 'Cleanup', conclusion: 'success' },
        ],
      }),
    ).toEqual(['Release gates'])
  })

  test('builds a failed-jobs-only retry command', () => {
    expect(retryFailedJobsArgs(123)).toEqual(['run', 'rerun', '123', '--failed'])
    expect(() => retryFailedJobsArgs(0)).toThrow('Invalid workflow run ID')
  })

  test('dispatches exact candidate identity from trusted main', () => {
    const manifest = {
      schemaVersion: 1 as const,
      requestId: crypto.randomUUID(),
      sourceSha: 'a'.repeat(40),
      marketingVersion: '0.83.1',
      versionCodes: { phone: 100_000_042, wear: 1_100_000_042 },
      workflow: { runId: 123, runUrl: 'https://example.test/123', runAttempt: 1 },
      artifacts: {
        phone: { name: 'phone.aab', sha256: 'a', signingCertificateSha256: 'c' },
        wear: { name: 'wear.aab', sha256: 'b', signingCertificateSha256: 'c' },
      },
      uploads: { phone: 'succeeded' as const, wear: 'succeeded' as const },
    }
    const requestId = crypto.randomUUID()
    expect(createPromotionDispatchPayload(manifest, requestId)).toEqual({
      ref: 'main',
      inputs: {
        request_id: requestId,
        candidate_run_id: '123',
        source_sha: 'a'.repeat(40),
        marketing_version: '0.83.1',
        phone_code: '100000042',
        wear_code: '1100000042',
      },
    })
  })

  test('lists only live release-manifest artifact runs once', () => {
    expect(
      parseManifestRunIds({
        artifacts: [
          { name: 'release-manifest', expired: false, workflow_run: { id: 3 } },
          { name: 'release-manifest', expired: false, workflow_run: { id: 3 } },
          { name: 'release-manifest', expired: true, workflow_run: { id: 2 } },
          { name: 'other', expired: false, workflow_run: { id: 1 } },
        ],
      }),
    ).toEqual([3])
  })

  test('uses configured phone and Wear track IDs', () => {
    expect(
      parseTrackConfig({
        variables: [
          { name: 'PLAY_PHONE_OPEN_TRACK', value: 'open-testing' },
          { name: 'PLAY_WEAR_OPEN_TRACK', value: 'wear:open-testing' },
        ],
      }),
    ).toEqual({
      phoneInternal: 'internal',
      phoneOpen: 'open-testing',
      wearInternal: 'wear:internal',
      wearOpen: 'wear:open-testing',
    })
  })

  test('correlates exact open-promotion run title', () => {
    const requestId = crypto.randomUUID()
    expect(
      parsePromotionWorkflowRuns(
        {
          workflow_runs: [
            {
              id: 304,
              html_url: 'https://example.test/304',
              display_title: `Open ${requestId}`,
              status: 'queued',
              conclusion: null,
            },
          ],
        },
        requestId,
      )?.id,
    ).toBe(304)
  })
})
