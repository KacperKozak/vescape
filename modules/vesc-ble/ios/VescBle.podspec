require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'VescBle'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'vesc-app-poc'
  s.homepage       = 'https://github.com/vesc-app-poc'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.source         = { :git => '' }

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.static_framework = true
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
  s.exclude_files = "**/*Tests.swift"

  s.test_spec 'Tests' do |test_spec|
    test_spec.source_files = "**/*Tests.swift"
  end
end
