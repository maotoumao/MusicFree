//
//  MFMediaCache.h
//  MusicFree —— range-aware 磁盘缓存（仅 progressive；对齐 Android SimpleCache 语义）
//
//  per-cacheKey 一个 .data 数据文件（按 offset 写、可含空洞）+ 一个 .meta JSON
//  （contentLength / contentType / 已缓存 range 列表 / lastAccess）。整套操作串到内部串行队列，
//  跨「loader 抓取队列」与「引擎主线程缓存 API」安全。超上限按 lastAccess LRU 整 key 淘汰。
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface MFMediaCache : NSObject

/// 目录固定 <Caches>/audio；maxBytes<=0 视为不缓存
- (instancetype)initWithMaxBytes:(long long)maxBytes;

/// 请求 [offset, offset+length) 完全命中缓存则返回数据，否则 nil（miss→走网络）
- (nullable NSData *)cachedDataForKey:(NSString *)key offset:(long long)offset length:(NSInteger)length;

/// 内容信息（首次网络响应后 store，供 contentInformationRequest 复用、命中时免联网）
- (BOOL)contentInfoForKey:(NSString *)key
                   length:(long long *)outLength
                     type:(NSString *_Nullable *_Nullable)outType;
- (void)storeContentInfoForKey:(NSString *)key length:(long long)length type:(nullable NSString *)type;

/// 某 offset 起的数据入盘 + 合并 range 元数据；触发 LRU 淘汰
- (void)storeData:(NSData *)data forKey:(NSString *)key atOffset:(long long)offset;

- (long long)totalBytes;
- (void)clearWithCompletion:(nullable void (^)(void))completion;
- (void)removeKey:(NSString *)key completion:(nullable void (^)(void))completion;

@end

NS_ASSUME_NONNULL_END
