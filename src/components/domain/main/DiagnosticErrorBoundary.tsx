import * as Sentry from '@sentry/react-native'
import { Component, type ErrorInfo, type PropsWithChildren } from 'react'

import { reportUiError } from '@/lib/uiDiagnostics'

export class DiagnosticErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    reportUiError(error, 'root_layout')
    Sentry.captureException(error)
  }

  render() {
    if (this.state.failed) return null
    return this.props.children
  }
}
