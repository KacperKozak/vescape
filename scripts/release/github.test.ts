import { describe, expect, test } from 'bun:test'
import {
  createDispatchPayload,
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
})
