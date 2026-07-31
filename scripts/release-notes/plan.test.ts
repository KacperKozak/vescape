import { describe, expect, test } from 'bun:test'

import { parsePublishedReleases } from './plan'

describe('published release parsing', () => {
  test('keeps only published production releases newest-first', () => {
    expect(
      parsePublishedReleases([
        { tag_name: 'v1', name: '', draft: false, prerelease: false, published_at: '2026-01-01' },
        { tag_name: 'preview', draft: false, prerelease: true, published_at: '2026-03-01' },
        {
          tag_name: 'v2',
          name: 'Two',
          draft: false,
          prerelease: false,
          published_at: '2026-02-01',
        },
      ]),
    ).toEqual([
      { tagName: 'v2', name: 'Two', publishedAt: '2026-02-01' },
      { tagName: 'v1', name: 'v1', publishedAt: '2026-01-01' },
    ])
  })
})
