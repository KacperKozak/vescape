require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'VescapeCore'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'vescape'
  s.homepage       = 'https://github.com/vescape'
  # 17.0 to match the app deployment target: the Board Session Live Activity (ActivityKit) driven
  # from this pod needs 16.1+, and the app already ships 17.0, so nothing runs below it.
  s.platform       = :ios, '17.0'
  s.swift_version  = '5.9'
  s.source         = { :git => '' }

  s.dependency 'ExpoModulesCore'
  # Single on-device database (mirrors Android Room). App data + telemetry live in one GRDB file.
  # 6.24.1 is the newest GRDB published to CocoaPods trunk; the 6.25–6.29 tags are SPM-only. The
  # SPM test target in `../Package.swift` therefore pins 6.29.3, the first 6.x that compiles under
  # SPM on current Xcode. Same major, same DatabaseMigrator semantics — see the note there.
  s.dependency 'GRDB.swift', '~> 6.24.1'

  # Swift/Objective-C compatibility
  s.static_framework = true
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
  s.exclude_files = "**/*Tests.swift"

  # Bundle the canonical cell-preset SoC curves so the iOS BatterySocEstimator can estimate battery
  # percent. `cell-presets.json` is a symlink to the single shared source (../../../shared/data);
  # CocoaPods only copies resources under the pod root, and following the symlink keeps one source
  # of truth instead of a committed per-platform copy.
  # `fixtures` is a symlink to `../../shared/fixtures` — bundled replay fixtures for the dev-mode
  # Replay UI (#230), same single-source pattern as `cell-presets.json`.
  s.resource_bundles = {
    'VescapeCoreAssets' => [
      'cell-presets.json',
      'legal-policies.json',
      'alerts/*.wav',
      'fixtures/*.jsonl'
    ]
  }

  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = "**/*Tests.swift"
  end
end
