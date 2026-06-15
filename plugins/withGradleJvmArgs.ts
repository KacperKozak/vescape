import { withGradleProperties, type ConfigPlugin } from 'expo/config-plugins'

/**
 * Raises the Gradle JVM caps and runs Android Lint in the daemon process.
 *
 * The Expo Android template ships `-Xmx2048m -XX:MaxMetaspaceSize=512m`, which
 * is too small for `lintVitalAnalyzeRelease` to analyze every linked native
 * module (svg, safe-area-context, masked-view, ...) — it dies with
 * `OutOfMemoryError: Metaspace` during release builds.
 *
 * Bumping `org.gradle.jvmargs` alone is NOT enough: AGP forks lint into its own
 * `GradleWorkerMain` process that runs with default heap (~512m) and does not
 * inherit the daemon's `jvmargs`. `runLintInProcess=true` makes lint execute
 * inside the well-provisioned daemon instead, so the bumped caps actually apply.
 */
const PROPERTIES: Record<string, string> = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'android.experimental.runLintInProcess': 'true',
}

const withGradleJvmArgs: ConfigPlugin = (config) =>
  withGradleProperties(config, (cfg) => {
    const keys = new Set(Object.keys(PROPERTIES))
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && keys.has(item.key)),
    )
    for (const [key, value] of Object.entries(PROPERTIES)) {
      cfg.modResults.push({ type: 'property', key, value })
    }
    return cfg
  })

export default withGradleJvmArgs
