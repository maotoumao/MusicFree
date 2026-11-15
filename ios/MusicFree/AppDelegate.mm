#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTConstants.h>
#import <React/RCTLinkingManager.h>
#import <RNFSManager.h>

// Apps linked against the iOS 27 SDK must adopt the UIScene life cycle.
// React Native 0.76 still builds a window from the app delegate, so the window
// is created here instead, once UIKit has handed us the window scene.
@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow *window;
@end

@implementation SceneDelegate

- (void)scene:(UIScene *)scene
    willConnectToSession:(UISceneSession *)session
                 options:(UISceneConnectionOptions *)connectionOptions
{
  if (![scene isKindOfClass:[UIWindowScene class]]) {
    return;
  }

  AppDelegate *appDelegate = (AppDelegate *)UIApplication.sharedApplication.delegate;

  // Under the scene life cycle the URL that launched the app arrives here
  // instead of in the app delegate's launch options. Forward it so that
  // Linking.getInitialURL() can resolve cold-start deep links.
  NSMutableDictionary *launchOptions = [NSMutableDictionary new];
  UIOpenURLContext *urlContext = connectionOptions.URLContexts.anyObject;
  if (urlContext) {
    launchOptions[UIApplicationLaunchOptionsURLKey] = urlContext.URL;
    if (urlContext.options.sourceApplication) {
      launchOptions[UIApplicationLaunchOptionsSourceApplicationKey] = urlContext.options.sourceApplication;
    }
  }

  UIWindow *window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene *)scene];
  UIView *rootView = [appDelegate.rootViewFactory viewWithModuleName:appDelegate.moduleName
                                                   initialProperties:appDelegate.initialProps
                                                       launchOptions:launchOptions];
  UIViewController *rootViewController = [appDelegate createRootViewController];
  [appDelegate setRootView:rootView toRootViewController:rootViewController];
  window.rootViewController = rootViewController;
  self.window = window;
  [window makeKeyAndVisible];
}

- (void)windowScene:(UIWindowScene *)windowScene
    didUpdateCoordinateSpace:(id<UICoordinateSpace>)previousCoordinateSpace
        interfaceOrientation:(UIInterfaceOrientation)previousInterfaceOrientation
             traitCollection:(UITraitCollection *)previousTraitCollection
{
  [[NSNotificationCenter defaultCenter] postNotificationName:RCTWindowFrameDidChangeNotification object:self];
}

- (void)scene:(UIScene *)scene openURLContexts:(NSSet<UIOpenURLContext *> *)URLContexts
{
  for (UIOpenURLContext *context in URLContexts) {
    [RCTLinkingManager application:UIApplication.sharedApplication openURL:context.URL options:@{}];
  }
}

@end

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"MusicFree";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  // The window is created by SceneDelegate instead.
  self.automaticallyLoadReactNativeWindow = NO;

  // A Live Activity outlives the process. On a cold start there is no playback
  // yet, so anything ActivityKit still knows about belongs to a previous run.
  if (@available(iOS 16.2, *)) {
    Class liveActivityClass = NSClassFromString(@"MFLiveActivity");
    SEL cleanupSelector = NSSelectorFromString(@"cleanupOrphans");
#if DEBUG
    NSLog(@"[MFLiveActivity] cleanup class=%@", liveActivityClass);
#endif
    if (liveActivityClass && [liveActivityClass respondsToSelector:cleanupSelector]) {
      ((void (*)(id, SEL))[liveActivityClass methodForSelector:cleanupSelector])(
          liveActivityClass, cleanupSelector);
    }
  }

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (UISceneConfiguration *)application:(UIApplication *)application
    configurationForConnectingSceneSession:(UISceneSession *)connectingSceneSession
                                   options:(UISceneConnectionOptions *)options
{
  UISceneConfiguration *configuration =
      [[UISceneConfiguration alloc] initWithName:@"Default Configuration"
                                     sessionRole:connectingSceneSession.role];
  configuration.delegateClass = [SceneDelegate class];
  return configuration;
}

- (BOOL)application:(UIApplication *)application
            openURL:(NSURL *)url
            options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options
{
  // Keep Expo's app delegate subscribers working, then hand the URL to RN Linking
  // (handles musicfree://install/... plugin links).
  [super application:application openURL:url options:options];
  return [RCTLinkingManager application:application openURL:url options:options];
}

- (void)application:(UIApplication *)application
    handleEventsForBackgroundURLSession:(NSString *)identifier
                      completionHandler:(void (^)(void))completionHandler
{
  // Required by react-native-fs for background downloads.
  [RNFSManager setCompletionHandlerForIdentifier:identifier completionHandler:completionHandler];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
