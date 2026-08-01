import { describe, expect, test } from 'bun:test'
import {
  assertReleasePreparationStatus,
  bumpMarketingVersion,
  parsePorcelainPaths,
  prepareTrainNotes,
  releaseTrainNotesPath,
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
        changedPaths: ['package.json', 'release-notes/0.83.md'],
        noteExists: true,
      }),
    ).not.toThrow()
  })

  test('allows resuming a release draft that skipped train notes', () => {
    expect(() =>
      assertReleasePreparationStatus({
        baseVersion: '0.83.1',
        workingVersion: '0.83.2',
        changedPaths: ['package.json'],
        noteExists: false,
      }),
    ).not.toThrow()
  })

  test('rejects unrelated changes while resuming a release draft', () => {
    expect(() =>
      assertReleasePreparationStatus({
        baseVersion: '0.83.1',
        workingVersion: '0.83.2',
        changedPaths: ['package.json', 'release-notes/0.83.md', 'src/app.ts'],
        noteExists: true,
      }),
    ).toThrow('Commit or stash')
  })

  test('rejects a release draft that deletes existing train notes', () => {
    expect(() =>
      assertReleasePreparationStatus({
        baseVersion: '0.83.1',
        workingVersion: '0.83.2',
        changedPaths: ['package.json', 'release-notes/0.83.md'],
        noteExists: false,
      }),
    ).toThrow('Commit or stash')
  })

  test('resolves patch versions to their release-train notes', () => {
    expect(releaseTrainNotesPath('0.84.3')).toBe('release-notes/0.84.md')
    expect(releaseTrainNotesPath('0.84.3-rc.1')).toBe('release-notes/0.84.md')
  })
})

describe('release-train authoring flow', () => {
  const markdown = '## Improved\n\n- Better release flow.\n'

  function dependencies(options: {
    exists: boolean
    choice: 'draft' | 'skip' | 'keep' | 'edit' | 'reprompt'
  }) {
    let exists = options.exists
    const calls: string[] = []
    const deps = {
      exists: async () => exists,
      read: async () => markdown,
      select: async () => options.choice,
      author: async () => {
        calls.push('author')
        exists = true
      },
      edit: async () => {
        calls.push('edit')
      },
      reprompt: async (_path: string, commits: string) => {
        calls.push(`reprompt:${commits}`)
      },
      commits: async () => 'abc1234 Add rider feature',
      validate: () => calls.push('validate'),
      build: async () => {
        calls.push('build')
      },
      log: () => {},
    }
    return { calls, deps }
  }

  test('minor bump can skip creating a train file', async () => {
    const { calls, deps } = dependencies({ exists: false, choice: 'skip' })
    expect(await prepareTrainNotes('minor', '0.85.0', deps)).toBe('release-notes/0.85.md')
    expect(calls).toEqual([])
  })

  test('minor bump can author and validate a new train file with Codex', async () => {
    const { calls, deps } = dependencies({ exists: false, choice: 'draft' })
    await prepareTrainNotes('minor', '0.85.0', deps)
    expect(calls).toEqual(['author', 'validate', 'build'])
  })

  test('patch bump keeps valid train notes without changing them', async () => {
    const { calls, deps } = dependencies({ exists: true, choice: 'keep' })
    await prepareTrainNotes('patch', '0.84.1', deps)
    expect(calls).toEqual(['validate', 'build'])
  })

  test('patch bump re-prompts Codex with commits since the train file changed', async () => {
    const { calls, deps } = dependencies({ exists: true, choice: 'reprompt' })
    await prepareTrainNotes('patch', '0.84.1', deps)
    expect(calls).toEqual(['reprompt:abc1234 Add rider feature', 'validate', 'build'])
  })
})
