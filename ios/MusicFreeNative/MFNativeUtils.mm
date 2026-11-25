#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>

@interface NativeUtils : NSObject <RCTBridgeModule>
@end

@implementation NativeUtils

RCT_EXPORT_MODULE(NativeUtils)

+ (BOOL)requiresMainQueueSetup
{
    return YES;
}

- (dispatch_queue_t)methodQueue
{
    return dispatch_get_main_queue();
}

/**
 * iOS has no supported way to quit an app programmatically; move it to the
 * background instead so the platform keeps controlling the process lifecycle.
 */
RCT_EXPORT_METHOD(exitApp)
{
    [[UIApplication sharedApplication] performSelector:@selector(suspend)];
}

RCT_EXPORT_METHOD(checkStoragePermission : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    resolve(@YES);
}

RCT_EXPORT_METHOD(requestStoragePermission)
{
}

RCT_EXPORT_BLOCKING_SYNCHRONOUS_METHOD(getWindowDimensions)
{
    // With the new architecture, blocking sync methods run on the JS thread,
    // so make sure UIKit is only touched from the main queue.
    __block NSDictionary *dimensions = nil;
    RCTUnsafeExecuteOnMainQueueSync(^{
        UIWindow *window = nil;
        for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
            if (scene.activationState == UISceneActivationStateForegroundActive &&
                [scene isKindOfClass:[UIWindowScene class]]) {
                for (UIWindow *candidate in ((UIWindowScene *)scene).windows) {
                    if (candidate.isKeyWindow) {
                        window = candidate;
                        break;
                    }
                }
            }
        }
        CGRect bounds = window ? window.bounds : UIScreen.mainScreen.bounds;
        dimensions = @{ @"width" : @(bounds.size.width), @"height" : @(bounds.size.height) };
    });
    return dimensions;
}

@end
