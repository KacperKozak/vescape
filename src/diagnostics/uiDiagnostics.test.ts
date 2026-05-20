import { mock, test, expect, beforeEach, afterEach } from 'bun:test'

import {
  reportUiError,
  resetUiErrorReporterForTests,
  setUiErrorReporterForTests,
} from './uiDiagnostics'

beforeEach(() => {
  setUiErrorReporterForTests(reportUiErrorNative)
  reportUiErrorNative.mockClear()
})

afterEach(() => {
  resetUiErrorReporterForTests()
})

const reportUiErrorNative = mock(() => {})

test('reports ui errors with source and stack', async () => {
  const error = new Error('render failed')

  reportUiError(error, 'root_layout')

  expect(reportUiErrorNative).toHaveBeenCalledWith('render failed', 'root_layout', error.stack)
})

test('does not duplicate failures already reported by native', async () => {
  reportUiError({ message: 'native rejected', nativeDiagnosticReported: true }, 'root_layout')

  expect(reportUiErrorNative).not.toHaveBeenCalled()
})
