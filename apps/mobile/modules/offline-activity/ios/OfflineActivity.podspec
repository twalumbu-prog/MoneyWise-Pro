Pod::Spec.new do |s|
  s.name           = 'OfflineActivity'
  s.version        = '1.0.0'
  s.summary        = 'MoneyWise offline Live Activity (Dynamic Island) controls'
  s.description    = s.summary
  s.author         = 'Blue Opus'
  s.homepage       = 'https://moneywise.blueopus.cloud'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files   = '**/*.swift'
end
