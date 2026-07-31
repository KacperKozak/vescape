import { describe, expect, test } from 'bun:test'
import {
  assertReleasePreparationStatus,
  bumpMarketingVersion,
  parsePorcelainPaths,
} from './prepare'

describe('release candidate version bump', () => {
  test('calculates explicit major, minor, and patch versions', () => {
    expect(bumpMarketingVersion('0.83.1', 'major')).toBe('1.0.0')
    expect(bumpMarketingVersion('0.83.1', 'minor')).toBe('0.84.0')
    expect(bumpMarketingVersion('0.83.1', 'patch')).toBe('0.83.2')
  })

  test('refuses prerelease and malformed versions', () => {
    expect(() => bumpMarketingVersion('0.83.1-beta.1', 'patch')).toThrow('non-stable')
    expect(() => bumpMarketingVersion('83.1', 'minor')).toThrow('non-stable')
  })

  test('preserves the leading status column when reading changed paths', () => {
    expect(parsePorcelainPaths(' M package.json\n?? release-notes/0.83.2.md')).toEqual([
      'package.json',
      'release-notes/0.83.2.md',
    ])
  })

  test('allows resuming an exact previously accepted release draft', () => {
    expect(() =>
      assertReleasePreparationStatus({
        baseVersion: '0.83.1',
        workingVersion: '0.83.2',
        changedPaths: ['package.json', 'release-notes/0.83.2.md'],
        noteExists: true,
      }),
    ).not.toThrow()
  })

  test('rejects unrelated changes while resuming a release draft', () => {
    expect(() =>
      assertReleasePreparationStatus({
        baseVersion: '0.83.1',
        workingVersion: '0.83.2',
        changedPaths: ['package.json', 'release-notes/0.83.2.md', 'src/app.ts'],
        noteExists: true,
      }),
    ).toThrow('Commit or stash')
  })
})
