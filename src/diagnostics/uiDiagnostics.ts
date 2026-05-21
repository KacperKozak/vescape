import { reportUiError as nativeReportUiError } from 'vesc-ble'

interface UiDiagnosticError {
  message?: string
  stack?: string
  nativeDiagnosticReported?: boolean
}

let uiErrorReporter = nativeReportUiError

export function reportUiError(error: unknown, source: string): void {
  const diagnostic = error as UiDiagnosticError | null
  if (diagnostic?.nativeDiagnosticReported) return
  const message = diagnostic?.message ?? String(error)
  uiErrorReporter(message, source, diagnostic?.stack ?? null)
}

export function setUiErrorReporterForTests(reporter: typeof nativeReportUiError): void {
  uiErrorReporter = reporter
}

export function resetUiErrorReporterForTests(): void {
  uiErrorReporter = nativeReportUiError
}
