import { describe, expect, test } from 'bun:test'

import { parseHistoricalProductionTags, parsePublishedReleases } from './plan'

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

describe('historical production tag parsing', () => {
  test('keeps stable legacy release boundaries and ignores unrelated tags', () => {
    expect(
      parseHistoricalProductionTags(
        ['production-0.83.1', 'pr-116-screenshots', 'production-0.83.0', 'production-bad'].join(
          '\n',
        ),
      ),
    ).toEqual([
      { tagName: 'production-0.83.1', name: '0.83.1', publishedAt: '' },
      { tagName: 'production-0.83.0', name: '0.83.0', publishedAt: '' },
    ])
  })
})
