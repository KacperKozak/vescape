import { describe, expect, test } from 'bun:test'
import type { ReleaseManifest } from './contracts'
import { parseReleaseManifest, releaseOutcome, retryFailedJobsArgs } from './contracts'

const manifest = (
  phone: 'succeeded' | 'failed',
  wear: 'succeeded' | 'failed',
): ReleaseManifest => ({
  schemaVersion: 1,
  requestId: '7f787fe8-4a30-4fcf-a3b1-4a9dd8606e38',
  sourceSha: 'a'.repeat(40),
  marketingVersion: '0.83.1',
  versionCodes: { phone: 100_000_042, wear: 1_100_000_042 },
  workflow: { runId: 123, runUrl: 'https://example.test/run/123', runAttempt: 1 },
  artifacts: {
    phone: { name: 'app-release.aab', sha256: 'a', signingCertificateSha256: 'c' },
    wear: { name: 'wearos-release.aab', sha256: 'b', signingCertificateSha256: 'c' },
  },
  uploads: { phone, wear },
})

describe('release manifest', () => {
  test('parses the workflow contract', () => {
    expect(parseReleaseManifest(manifest('succeeded', 'succeeded')).sourceSha).toBe('a'.repeat(40))
    expect(() => parseReleaseManifest({ schemaVersion: 2 })).toThrow('invalid shape')
  })

  test('reports a partial upload explicitly', () => {
    expect(releaseOutcome(manifest('succeeded', 'failed'))).toEqual({
      kind: 'partial',
      succeeded: 'phone',
      failed: 'wear',
    })
  })

  test('retries failed workflow jobs while preserving successful uploads', () => {
    expect(retryFailedJobsArgs(manifest('succeeded', 'failed'))).toEqual([
      'run',
      'rerun',
      '123',
      '--failed',
    ])
    expect(retryFailedJobsArgs(manifest('succeeded', 'succeeded'))).toBeNull()
  })
})
