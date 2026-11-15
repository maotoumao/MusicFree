Pod::Spec.new do |s|
  s.name         = "MusicFreeNative"
  s.version      = "0.1.0"
  s.summary      = "iOS native modules for MusicFree"
  s.homepage     = "https://github.com/maotoumao/MusicFree"
  s.license      = { :type => "AGPL-3.0" }
  s.author       = { "MusicFree contributors" => "noreply@github.com" }
  s.platform     = :ios, "15.1"
  s.source       = { :path => "." }
  s.source_files = "*.{h,m,mm}"
  s.frameworks   = "AVFoundation", "UIKit"
  s.dependency "React-Core"
end
