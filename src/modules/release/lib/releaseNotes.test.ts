import { describe, expect, test } from 'bun:test'

import {
  compareMarketingVersions,
  parseMarketingVersion,
  releaseTrainForVersion,
  selectReleaseNotes,
} from './releaseNotes'

describe('release-note selection', () => {
  test('shows installed and older versions newest-first', () => {
    const notes = [
      { version: '0.82', markdown: 'old' },
      { version: '0.84', markdown: 'future' },
      { version: '0.83', markdown: 'current' },
    ]

    expect(selectReleaseNotes(notes, '0.83.1')).toEqual([
      { version: '0.83', markdown: 'current' },
      { version: '0.82', markdown: 'old' },
    ])
  })

  test('parses and compares train versions with full marketing versions', () => {
    expect(parseMarketingVersion('1.12')).not.toBeNull()
    expect(compareMarketingVersions('1.12', '1.12.0')).toBe(0)
    expect(compareMarketingVersions('1.12', '1.11.9')).toBeGreaterThan(0)
    expect(releaseTrainForVersion('1.12.3')).toBe('1.12')
    expect(releaseTrainForVersion('1.12.3-rc.1')).toBe('1.12')
    expect(releaseTrainForVersion('latest')).toBeNull()
  })

  test('tolerates missing notes for the installed train', () => {
    expect(selectReleaseNotes([{ version: '0.83', markdown: 'old' }], '0.84')).toEqual([
      { version: '0.83', markdown: 'old' },
    ])
  })

  test('orders prereleases before their final release', () => {
    expect(compareMarketingVersions('1.0.0-rc.2', '1.0.0-rc.10')).toBeLessThan(0)
    expect(compareMarketingVersions('1.0.0', '1.0.0-rc.10')).toBeGreaterThan(0)
  })

  test('selects notes when the runtime does not provide Array.toSorted', () => {
    const original = Array.prototype.toSorted
    Object.defineProperty(Array.prototype, 'toSorted', { configurable: true, value: undefined })
    try {
      expect(selectReleaseNotes([{ version: '1.0', markdown: 'Current' }], '1.0')).toEqual([
        { version: '1.0', markdown: 'Current' },
      ])
    } finally {
      Object.defineProperty(Array.prototype, 'toSorted', {
        configurable: true,
        value: original,
        writable: true,
      })
    }
  })
})
