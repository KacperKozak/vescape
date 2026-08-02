import { describe, expect, it } from 'bun:test'
import {
  missingProductionConfig,
  REQUIRED_PRODUCTION_ENV,
  sentryNativeInitProblems,
} from './productionConfig.ts'

const completeEnv = Object.fromEntries(REQUIRED_PRODUCTION_ENV.map((name) => [name, 'value']))

const manifest = (metaData: string) => `<manifest><application>${metaData}</application></manifest>`

const sentryMetaData = `
  <meta-data android:name="io.sentry.dsn" android:value="https://key@sentry.io/1"/>
  <meta-data android:name="io.sentry.auto-init" android:value="true"/>
  <meta-data android:name="io.sentry.environment" android:value="production"/>
`

describe('missingProductionConfig', () => {
  it('accepts a complete environment', () => {
    expect(missingProductionConfig(completeEnv)).toEqual([])
  })

  it('reports unset and blank values', () => {
    const env = { ...completeEnv, EXPO_PUBLIC_SENTRY_DSN: undefined, SENTRY_AUTH_TOKEN: '  ' }
    expect(missingProductionConfig(env)).toEqual(['EXPO_PUBLIC_SENTRY_DSN', 'SENTRY_AUTH_TOKEN'])
  })
})

describe('sentryNativeInitProblems', () => {
  it('accepts a manifest that starts Sentry before JS', () => {
    expect(sentryNativeInitProblems(manifest(sentryMetaData))).toEqual([])
  })

  it('rejects the React Native SDK default auto-init', () => {
    const merged = manifest('<meta-data android:name="io.sentry.auto-init" android:value="false"/>')
    expect(sentryNativeInitProblems(merged)).toEqual([
      'io.sentry.auto-init is "false"',
      'io.sentry.dsn is missing',
      'io.sentry.environment is "<missing>"',
    ])
  })

  it('rejects an unresolved environment placeholder', () => {
    const merged = manifest(
      sentryMetaData.replace('android:value="production"', 'android:value="${sentryEnvironment}"'),
    )
    expect(sentryNativeInitProblems(merged)).toEqual([
      'io.sentry.environment is "${sentryEnvironment}"',
    ])
  })

  it('reads attributes written in either order', () => {
    const merged = manifest(
      '<meta-data android:value="true" android:name="io.sentry.auto-init"/>' +
        '<meta-data android:value="https://key@sentry.io/1" android:name="io.sentry.dsn"/>' +
        '<meta-data android:value="production" android:name="io.sentry.environment"/>',
    )
    expect(sentryNativeInitProblems(merged)).toEqual([])
  })
})
