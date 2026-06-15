import { withGradleProperties, type ConfigPlugin } from 'expo/config-plugins'

/**
 * Raises the Gradle JVM heap and Metaspace caps.
 *
 * The Expo Android template ships `-Xmx2048m -XX:MaxMetaspaceSize=512m`, which
 * is too small for `lintVitalAnalyzeRelease` to analyze every linked native
 * module (svg, safe-area-context, masked-view, ...) in one worker — it dies
 * with `OutOfMemoryError: Metaspace` during release builds. Bump both caps.
 */
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1024m'

const withGradleJvmArgs: ConfigPlugin = (config) =>
  withGradleProperties(config, (cfg) => {
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'),
    )
    cfg.modResults.push({
      type: 'property',
      key: 'org.gradle.jvmargs',
      value: JVM_ARGS,
    })
    return cfg
  })

export default withGradleJvmArgs
