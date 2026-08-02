import { describe, expect, test } from 'bun:test'

import {
  compileReleaseNotes,
  validateGeneratedReleaseNotes,
  validateReleaseMarkdown,
} from './bundler'

describe('release-note bundler', () => {
  test('sorts canonical notes and emits typed deterministic data', () => {
    const output = compileReleaseNotes([
      { fileName: '0.9.md', version: '0.9', markdown: '## Fixed\n\n- One\n' },
      { fileName: '0.10.md', version: '0.10', markdown: '## New\n\n- Two\n' },
    ])

    expect(output.indexOf('0.10')).toBeLessThan(output.indexOf('0.9'))
    expect(output).toContain('satisfies readonly BundledReleaseNote[]')
    expect(compileReleaseNotes([])).toContain('export const bundledReleaseNotes = [\n\n]')
  })

  test('rejects malformed, duplicate, and unsupported inputs', () => {
    expect(() =>
      compileReleaseNotes([{ fileName: 'latest.md', version: 'latest', markdown: 'Notes' }]),
    ).toThrow('release train')
    expect(() =>
      compileReleaseNotes([
        { fileName: '1.2.3.md', version: '1.2.3', markdown: '## Fixed\n\n- One\n' },
      ]),
    ).toThrow('release train')
    expect(() =>
      compileReleaseNotes([
        { fileName: '1.0.md', version: '1.0', markdown: 'One' },
        { fileName: '1.0.md', version: '1.0', markdown: 'Two' },
      ]),
    ).toThrow('Duplicate')
    expect(() => validateReleaseMarkdown('<script>alert(1)</script>')).toThrow(
      'unsupported Markdown',
    )
    expect(() => validateReleaseMarkdown('# Version 1')).toThrow('unsupported section heading')
    expect(() => validateReleaseMarkdown('## Fixed\n\n- One\n\n## New\n\n- Two')).toThrow(
      'sections must be ordered',
    )
  })

  test('reports missing and stale generated output clearly', () => {
    expect(() => validateGeneratedReleaseNotes(null, 'expected')).toThrow(
      'Bundled release notes are missing',
    )
    expect(() => validateGeneratedReleaseNotes('old', 'expected')).toThrow(
      'Bundled release notes are stale',
    )
    expect(() => validateGeneratedReleaseNotes('expected', 'expected')).not.toThrow()
  })
})
