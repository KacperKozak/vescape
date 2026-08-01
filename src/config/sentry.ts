import * as Sentry from '@sentry/react-native'

/**
 * Crash and error monitoring. Captures native crashes (Kotlin/Swift, signal
 * handlers) and unhandled JS errors — the failures PostHog diagnostics can't
 * see because they kill the app before any event is sent.
 *
 * On Android the native SDK is already running before this executes
 * (manifest auto-init via `plugins/withSentryNativeInit`), so crashes during
 * native startup are captured too; this call re-initializes it with the JS
 * options and hooks up the JS error handlers.
 *
 * On iOS there is no manifest equivalent — sentry-cocoa only starts from code — so failures
 * before this call (native startup, root module evaluation) are still invisible there.
 *
 * Disabled when `EXPO_PUBLIC_SENTRY_DSN` is unset (local dev without a DSN).
 */
const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN

export const initSentry = () => {
  Sentry.init({
    dsn,
    enabled: Boolean(dsn),
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    // Errors only — no performance tracing in the PoC.
    tracesSampleRate: 0,
  })
}
