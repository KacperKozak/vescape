import { describe, expect, test } from 'bun:test'
import type { ReleaseManifest } from './contracts'
import {
  parsePromotionManifest,
  parseReleaseManifest,
  promotionSummary,
  releaseOutcome,
} from './contracts'

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

describe('open promotion manifest', () => {
  const promotion = {
    schemaVersion: 1 as const,
    requestId: '7f787fe8-4a30-4fcf-a3b1-4a9dd8606e38',
    candidateRunId: 123,
    sourceSha: 'a'.repeat(40),
    marketingVersion: '0.83.1',
    phone: {
      versionCode: 100_000_042,
      sourceTrack: 'internal',
      targetTrack: 'beta',
      status: 'already-open' as const,
    },
    wear: {
      versionCode: 1_100_000_042,
      sourceTrack: 'wear:internal',
      targetTrack: 'wear:beta',
      status: 'promoted' as const,
    },
  }

  test('parses exact per-form-factor state', () => {
    expect(parsePromotionManifest(promotion)).toEqual(promotion)
    expect(() => parsePromotionManifest({ ...promotion, candidateRunId: 0 })).toThrow(
      'invalid shape',
    )
  })

  test('renders partial retry convergence', () => {
    expect(promotionSummary(promotion)).toBe(
      'phone 100000042: already-open · Wear 1100000042: promoted',
    )
  })
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
})
