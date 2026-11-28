//
//  MFResourceLoader.h
//  MusicFree —— 自定义 scheme 资源加载委托（per-asset，对齐 Android ResolvingDataSource + RoutingDataSource）
//
//  职责：占位 URL(musicfree://resolve/<cacheKey>) 首次数据请求时经 engine 惰性触发 onResolveSource →
//  拿到真实 url+headers 后自己发 URLSession range 抓取、喂 AVAssetResourceLoadingDataRequest。
//  progressive：headers 自管 +（ST2）磁盘缓存 cache-first；hls：重定向真清单（ST3）。
//

#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>

@class MFAudioEngine;
@class MFMediaCache;

NS_ASSUME_NONNULL_BEGIN

/// 占位 scheme / 前缀（与 Android PLACEHOLDER_SCHEME 一致）
extern NSString *const MFPlaceholderScheme;  // "musicfree"
extern NSString *const MFPlaceholderPrefix;  // "musicfree://resolve/"

/// per-asset 资源加载委托（asset.resourceLoader 弱持有 → 需与 AVPlayerItem 一起 retain）
@interface MFResourceLoader : NSObject <AVAssetResourceLoaderDelegate>
/// queue 为资源加载委托回调所在的串行队（与 resolve 回填共用，保 loader 状态安全）
- (instancetype)initWithCacheKey:(NSString *)cacheKey
                      streamType:(nullable NSString *)streamType
                          engine:(MFAudioEngine *)engine
                           queue:(dispatch_queue_t)queue
                           cache:(nullable MFMediaCache *)cache;

/// 释放正在进行的 URLSession（换槽/reset 时）
- (void)invalidate;
@end

NS_ASSUME_NONNULL_END
