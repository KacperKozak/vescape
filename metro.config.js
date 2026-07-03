const { getSentryExpoConfig } = require('@sentry/react-native/metro')

const config = getSentryExpoConfig(__dirname)

config.resolver.blockList = [/.*\.test\.[jt]sx?$/, /.*\/__tests__\/.*/]
config.resolver.assetExts.push('wasm')

module.exports = config
