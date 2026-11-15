#import <React/RCTBridgeModule.h>

/**
 * Placeholder for the Android floating status-bar lyric window. iOS has no
 * equivalent overlay; a Live Activity / Dynamic Island implementation will
 * replace this stub.
 */
@interface LyricUtil : NSObject <RCTBridgeModule>
@end

@implementation LyricUtil

RCT_EXPORT_MODULE(LyricUtil)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

RCT_EXPORT_METHOD(checkSystemAlertPermission : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(@NO);
}

RCT_EXPORT_METHOD(requestSystemAlertPermission : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(@NO);
}

RCT_EXPORT_METHOD(showStatusBarLyric : (NSString *)lyric
                  config : (NSDictionary *)config
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    reject(@"Unsupported", @"Status bar lyrics are not available on iOS", nil);
}

RCT_EXPORT_METHOD(hideStatusBarLyric : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_METHOD(setStatusBarLyricText : (NSString *)lyric
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_METHOD(setStatusBarLyricTop : (double)percent
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_METHOD(setStatusBarLyricLeft : (double)percent
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_METHOD(setStatusBarLyricWidth : (double)percent
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_METHOD(setStatusBarLyricFontSize : (double)fontSize
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_METHOD(setStatusBarLyricAlign : (double)alignment
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

RCT_EXPORT_METHOD(setStatusBarColors : (NSString *)textColor
                  backgroundColor : (NSString *)backgroundColor
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(nil);
}

@end
