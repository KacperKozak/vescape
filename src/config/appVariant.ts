const configuredAppVariant = process.env.EXPO_PUBLIC_VESCAPE_APP_VARIANT ?? 'production'

if (configuredAppVariant !== 'development' && configuredAppVariant !== 'production') {
  throw new Error(
    `Invalid EXPO_PUBLIC_VESCAPE_APP_VARIANT "${configuredAppVariant}"; expected "development" or "production".`,
  )
}

export const appVariant = configuredAppVariant
export const isDevelopmentApp = appVariant === 'development'
export const applicationId = isDevelopmentApp ? 'app.vescape.dev' : 'app.vescape'
