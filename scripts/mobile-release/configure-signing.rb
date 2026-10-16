require 'xcodeproj'

profile = ENV.fetch('IOS_PROFILE_UUID')
identity = ENV.fetch('IOS_SIGNING_IDENTITY')
raise 'Invalid profile UUID' unless profile.match?(/\A[A-Fa-f0-9-]{36}\z/)
raise 'Invalid signing identity' unless identity.match?(/\A[A-F0-9]{40}\z/)
project = Xcodeproj::Project.open('mobile/ios/BBTalk.xcodeproj')
applications = project.targets.select { |target| target.product_type == 'com.apple.product-type.application' }
raise 'Expected one application without extensions' unless applications.size == 1 && project.targets.none? { |target| target.product_type == 'com.apple.product-type.app-extension' }
applications.first.build_configurations.each do |config|
  raise 'Unexpected application identifier' unless config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] == 'com.chewy.bbtalk'
  config.build_settings['CODE_SIGN_STYLE'] = 'Manual'
  config.build_settings['DEVELOPMENT_TEAM'] = '3GB4JPZU5X'
  config.build_settings['CODE_SIGN_IDENTITY'] = identity
  config.build_settings['PROVISIONING_PROFILE_SPECIFIER'] = profile
end
project.save
