#import <React/RCTBridgeModule.h>

/**
 * iOS counterpart of the Android floating status-bar lyric window. The Swift
 * class bridges lyric updates into a Live Activity (lock screen + Dynamic
 * Island).
 */
@interface RCT_EXTERN_MODULE(LyricUtil, NSObject)

RCT_EXTERN_METHOD(checkSystemAlertPermission : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(requestSystemAlertPermission : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(showStatusBarLyric : (NSString *)lyric
                  config : (NSDictionary *)config
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(hideStatusBarLyric : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStatusBarLyricText : (NSString *)lyric
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStatusBarLyricTop : (double)percent
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStatusBarLyricLeft : (double)percent
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStatusBarLyricWidth : (double)percent
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStatusBarLyricFontSize : (double)fontSize
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStatusBarLyricAlign : (double)alignment
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStatusBarColors : (NSString *)textColor
                  backgroundColor : (NSString *)backgroundColor
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)

@end
