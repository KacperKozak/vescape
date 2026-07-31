import { describe, expect, test } from 'bun:test'
import { createDispatchPayload, parseWorkflowRuns } from './github'

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
})
