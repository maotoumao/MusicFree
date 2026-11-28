//
//  MFMediaCache.mm
//  MusicFree —— range-aware 磁盘缓存实现
//

#import "MFMediaCache.h"
#import <CommonCrypto/CommonCrypto.h>

#pragma mark - 条目

@interface MFCacheEntry : NSObject
@property(nonatomic, copy) NSString *key;
@property(nonatomic, assign) long long contentLength;
@property(nonatomic, copy, nullable) NSString *contentType;
@property(nonatomic, strong) NSMutableArray<NSValue *> *ranges;  // NSRange（location=start, length）非重叠已排序
@property(nonatomic, assign) NSTimeInterval lastAccess;
@property(nonatomic, assign) long long cachedBytes;  // range 长度之和（供 LRU/总量）
@end

@implementation MFCacheEntry
- (instancetype)init { if (self = [super init]) { _ranges = [NSMutableArray array]; } return self; }
@end

#pragma mark - MFMediaCache

@interface MFMediaCache ()
@property(nonatomic, copy) NSString *dir;
@property(nonatomic, assign) long long maxBytes;
@property(nonatomic, strong) dispatch_queue_t queue;
@property(nonatomic, strong) NSMutableDictionary<NSString *, MFCacheEntry *> *entries;
@property(nonatomic, assign) long long runningTotal;
@property(nonatomic, strong) NSMutableSet<NSString *> *dirtyKeys;  // 待持久化 meta 的 key（节流）
@property(nonatomic, assign) BOOL flushScheduled;
@end

@implementation MFMediaCache

- (instancetype)initWithMaxBytes:(long long)maxBytes {
    if (self = [super init]) {
        _maxBytes = maxBytes;
        _queue = dispatch_queue_create("fun.upup.musicfree.audio.cache", DISPATCH_QUEUE_SERIAL);
        _entries = [NSMutableDictionary dictionary];
        _runningTotal = 0;
        _dirtyKeys = [NSMutableSet set];
        _flushScheduled = NO;
        NSString *caches = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject;
        _dir = [caches stringByAppendingPathComponent:@"audio"];
        [[NSFileManager defaultManager] createDirectoryAtPath:_dir withIntermediateDirectories:YES attributes:nil error:nil];
        [self loadIndex];
    }
    return self;
}

#pragma mark - 路径 / 索引

- (NSString *)sha:(NSString *)key {
    NSData *d = [key dataUsingEncoding:NSUTF8StringEncoding];
    unsigned char out[CC_SHA256_DIGEST_LENGTH];
    CC_SHA256(d.bytes, (CC_LONG)d.length, out);
    NSMutableString *s = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
    for (int i = 0; i < CC_SHA256_DIGEST_LENGTH; i++) [s appendFormat:@"%02x", out[i]];
    return s;
}
- (NSString *)dataPathForSha:(NSString *)sha { return [self.dir stringByAppendingPathComponent:[sha stringByAppendingPathExtension:@"data"]]; }
- (NSString *)metaPathForSha:(NSString *)sha { return [self.dir stringByAppendingPathComponent:[sha stringByAppendingPathExtension:@"meta"]]; }

/// 启动时扫 .meta 重建索引（缓存跨启动存活）
- (void)loadIndex {
    NSFileManager *fm = [NSFileManager defaultManager];
    for (NSString *name in [fm contentsOfDirectoryAtPath:self.dir error:nil]) {
        if (![name.pathExtension isEqualToString:@"meta"]) continue;
        NSString *metaPath = [self.dir stringByAppendingPathComponent:name];
        NSData *json = [NSData dataWithContentsOfFile:metaPath];
        id obj = json ? [NSJSONSerialization JSONObjectWithData:json options:0 error:nil] : nil;
        NSString *sha = name.stringByDeletingPathExtension;
        if (![obj isKindOfClass:[NSDictionary class]]) continue;  // 坏 meta（非对象）→跳过
        NSDictionary *m = obj;
        NSString *key = [m[@"key"] isKindOfClass:[NSString class]] ? m[@"key"] : nil;
        if (!key || ![fm fileExistsAtPath:[self dataPathForSha:sha]]) continue;  // 无 key/数据文件缺
        MFCacheEntry *e = [MFCacheEntry new];
        e.key = key;
        e.contentLength = [m[@"contentLength"] isKindOfClass:[NSNumber class]] ? [m[@"contentLength"] longLongValue] : 0;
        e.contentType = [m[@"contentType"] isKindOfClass:[NSString class]] ? m[@"contentType"] : nil;
        e.lastAccess = [m[@"lastAccess"] isKindOfClass:[NSNumber class]] ? [m[@"lastAccess"] doubleValue] : 0;
        NSArray *ranges = [m[@"ranges"] isKindOfClass:[NSArray class]] ? m[@"ranges"] : @[];
        for (id pair in ranges) {
            if ([pair isKindOfClass:[NSArray class]] && [(NSArray *)pair count] == 2 &&
                [pair[0] isKindOfClass:[NSNumber class]] && [pair[1] isKindOfClass:[NSNumber class]]) {
                NSRange r = NSMakeRange([pair[0] unsignedIntegerValue], [pair[1] unsignedIntegerValue]);
                [e.ranges addObject:[NSValue valueWithRange:r]];
                e.cachedBytes += r.length;
            }
        }
        self.entries[key] = e;
        self.runningTotal += e.cachedBytes;
    }
}

/// 节流持久化：内存即时更新，meta 写盘延迟合并（避免每个 chunk/命中都写小文件）
- (void)markDirty:(NSString *)key {
    [self.dirtyKeys addObject:key];
    if (self.flushScheduled) return;
    self.flushScheduled = YES;
    __weak typeof(self) ws = self;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(2 * NSEC_PER_SEC)), self.queue, ^{
        __strong typeof(self) self = ws; if (!self) return;
        self.flushScheduled = NO;
        for (NSString *k in [self.dirtyKeys copy]) {
            MFCacheEntry *e = self.entries[k];
            if (e) [self persistEntry:e];
        }
        [self.dirtyKeys removeAllObjects];
    });
}

- (void)persistEntry:(MFCacheEntry *)e {
    NSMutableArray *ranges = [NSMutableArray array];
    for (NSValue *v in e.ranges) { NSRange r = v.rangeValue; [ranges addObject:@[@(r.location), @(r.length)]]; }
    NSMutableDictionary *m = [@{@"key": e.key, @"contentLength": @(e.contentLength),
                                @"ranges": ranges, @"lastAccess": @(e.lastAccess)} mutableCopy];
    if (e.contentType) m[@"contentType"] = e.contentType;
    NSData *json = [NSJSONSerialization dataWithJSONObject:m options:0 error:nil];
    [json writeToFile:[self metaPathForSha:[self sha:e.key]] atomically:YES];
}

#pragma mark - range 合并 / 覆盖

- (void)insertRange:(NSRange)nr into:(MFCacheEntry *)e {
    NSMutableArray<NSValue *> *all = [e.ranges mutableCopy];
    [all addObject:[NSValue valueWithRange:nr]];
    [all sortUsingComparator:^NSComparisonResult(NSValue *a, NSValue *b) {
        NSUInteger la = a.rangeValue.location, lb = b.rangeValue.location;
        if (la == lb) return NSOrderedSame;
        return la < lb ? NSOrderedAscending : NSOrderedDescending;
    }];
    NSMutableArray<NSValue *> *merged = [NSMutableArray array];
    for (NSValue *v in all) {
        NSRange r = v.rangeValue;
        if (merged.count == 0) { [merged addObject:v]; continue; }
        NSRange last = merged.lastObject.rangeValue;
        if (r.location <= NSMaxRange(last)) {  // 相邻或重叠 → 并入
            NSUInteger end = MAX(NSMaxRange(last), NSMaxRange(r));
            merged[merged.count - 1] = [NSValue valueWithRange:NSMakeRange(last.location, end - last.location)];
        } else {
            [merged addObject:v];
        }
    }
    long long before = e.cachedBytes, after = 0;
    for (NSValue *v in merged) after += v.rangeValue.length;
    e.ranges = merged;
    e.cachedBytes = after;
    self.runningTotal += (after - before);
}

/// [offset, offset+length) 是否被某单一 range 完全覆盖
- (BOOL)entry:(MFCacheEntry *)e covers:(long long)offset length:(NSInteger)length {
    for (NSValue *v in e.ranges) {
        NSRange r = v.rangeValue;
        if ((long long)r.location <= offset && offset + length <= (long long)NSMaxRange(r)) return YES;
    }
    return NO;
}

#pragma mark - 读

- (NSData *)cachedDataForKey:(NSString *)key offset:(long long)offset length:(NSInteger)length {
    __block NSData *result = nil;
    dispatch_sync(self.queue, ^{
        MFCacheEntry *e = self.entries[key];
        if (!e || ![self entry:e covers:offset length:length]) return;
        NSFileHandle *fh = [NSFileHandle fileHandleForReadingAtPath:[self dataPathForSha:[self sha:key]]];
        if (!fh) return;
        NSError *err = nil;
        if (@available(iOS 13.0, *)) {
            [fh seekToOffset:(unsigned long long)offset error:&err];
            if (!err) result = [fh readDataUpToLength:length error:&err];
        }
        [fh closeFile];
        if (err || result.length != (NSUInteger)length) { result = nil; return; }  // 短读/出错=视为 miss
        e.lastAccess = [NSDate timeIntervalSinceReferenceDate];
        [self markDirty:key];
    });
    return result;
}

- (BOOL)contentInfoForKey:(NSString *)key length:(long long *)outLength type:(NSString *_Nullable *_Nullable)outType {
    __block BOOL has = NO;
    dispatch_sync(self.queue, ^{
        MFCacheEntry *e = self.entries[key];
        if (e && e.contentLength > 0) {
            has = YES;
            if (outLength) *outLength = e.contentLength;
            if (outType) *outType = e.contentType;
        }
    });
    return has;
}

#pragma mark - 写

- (void)storeContentInfoForKey:(NSString *)key length:(long long)length type:(nullable NSString *)type {
    dispatch_async(self.queue, ^{
        if (self.maxBytes <= 0) return;
        MFCacheEntry *e = [self ensureEntry:key];
        if (length > 0) e.contentLength = length;
        if (type) e.contentType = type;
        [self markDirty:key];
    });
}

- (void)storeData:(NSData *)data forKey:(NSString *)key atOffset:(long long)offset {
    if (data.length == 0) return;
    dispatch_async(self.queue, ^{
        if (self.maxBytes <= 0) return;
        MFCacheEntry *e = [self ensureEntry:key];
        NSString *path = [self dataPathForSha:[self sha:key]];
        NSFileManager *fm = [NSFileManager defaultManager];
        if (![fm fileExistsAtPath:path]) [fm createFileAtPath:path contents:nil attributes:nil];
        NSFileHandle *fh = [NSFileHandle fileHandleForWritingAtPath:path];
        if (!fh) return;
        NSError *err = nil;
        if (@available(iOS 13.0, *)) {
            [fh seekToOffset:(unsigned long long)offset error:&err];
            if (!err) [fh writeData:data error:&err];
        }
        [fh closeFile];
        if (err) return;
        [self insertRange:NSMakeRange((NSUInteger)offset, data.length) into:e];
        e.lastAccess = [NSDate timeIntervalSinceReferenceDate];
        [self markDirty:key];
        [self evictIfNeeded];
    });
}

- (MFCacheEntry *)ensureEntry:(NSString *)key {
    MFCacheEntry *e = self.entries[key];
    if (!e) { e = [MFCacheEntry new]; e.key = key; self.entries[key] = e; }
    return e;
}

- (void)evictIfNeeded {
    while (self.runningTotal > self.maxBytes && self.entries.count > 0) {
        MFCacheEntry *lru = nil;
        for (MFCacheEntry *e in self.entries.allValues) {
            if (!lru || e.lastAccess < lru.lastAccess) lru = e;
        }
        if (!lru) break;
        [self removeKeyLocked:lru.key];
    }
}

#pragma mark - 总量 / 清理

- (long long)totalBytes {
    __block long long t = 0;
    dispatch_sync(self.queue, ^{ t = self.runningTotal; });
    return t;
}

- (void)clearWithCompletion:(nullable void (^)(void))completion {
    dispatch_async(self.queue, ^{
        NSFileManager *fm = [NSFileManager defaultManager];
        for (NSString *name in [fm contentsOfDirectoryAtPath:self.dir error:nil]) {
            [fm removeItemAtPath:[self.dir stringByAppendingPathComponent:name] error:nil];
        }
        [self.entries removeAllObjects];
        [self.dirtyKeys removeAllObjects];
        self.runningTotal = 0;
        if (completion) completion();
    });
}

- (void)removeKey:(NSString *)key completion:(nullable void (^)(void))completion {
    dispatch_async(self.queue, ^{ [self removeKeyLocked:key]; if (completion) completion(); });
}

- (void)removeKeyLocked:(NSString *)key {
    MFCacheEntry *e = self.entries[key];
    if (!e) return;
    NSString *sha = [self sha:key];
    NSFileManager *fm = [NSFileManager defaultManager];
    [fm removeItemAtPath:[self dataPathForSha:sha] error:nil];
    [fm removeItemAtPath:[self metaPathForSha:sha] error:nil];
    self.runningTotal -= e.cachedBytes;
    [self.dirtyKeys removeObject:key];
    [self.entries removeObjectForKey:key];
}

@end
