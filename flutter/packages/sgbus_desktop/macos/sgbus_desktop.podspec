Pod::Spec.new do |s|
  s.name             = 'sgbus_desktop'
  s.version          = '1.0.0'
  s.summary          = "SG Bus Timings' desktop native parts."
  s.homepage         = 'https://sgbus.uwuapps.org'
  s.license          = { :type => 'MIT' }
  s.author           = { 'UwU Apps' => 'augybiz@gmail.com' }
  s.source           = { :path => '.' }
  s.source_files     = 'Classes/**/*'
  s.dependency 'FlutterMacOS'
  s.platform = :osx, '10.15'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.swift_version = '5.0'
end
