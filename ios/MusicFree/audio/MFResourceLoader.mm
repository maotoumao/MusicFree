//
//  MFResourceLoader.mm
//  MusicFree —— 自定义 scheme 资源加载委托实现（progressive lazy resolve + URLSession range 抓取 + cache-first 磁盘缓存）
//

#import "MFResourceLoader.h"
#import "MFAudioEngine.h"
#import "MFMediaCache.h"
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

NSString *const MFPlaceholderScheme = @"musicfree";
NSString *const MFPlaceholderPrefix = @"musicfree://resolve/";

@interface MFResourceLoader () <NSURLSessionDataDelegate>
@property(nonatomic, copy) NSString *cacheKey;
@property(nonatomic, copy, nullable) NSString *streamType;
@property(nonatomic, weak) MFAudioEngine *engine;
@property(nonatomic, strong) dispatch_queue_t queue;
@property(nonatomic, strong, nullable) MFMediaCache *cache;
@property(nonatomic, assign) BOOL invalidated;  // 换槽/reset 后置：后续回调全 no-op

@property(nonatomic, assign) BOOL resolving;
@property(nonatomic, assign) BOOL resolved;
@property(nonatomic, assign) BOOL resolveFailed;
@property(nonatomic, strong, nullable) NSURL *resolvedURL;
@property(nonatomic, copy) NSDictionary<NSString *, NSString *> *resolvedHeaders;

@property(nonatomic, strong) NSMutableArray<AVAssetResourceLoadingRequest *> *waitingForResolve;
@property(nonatomic, strong) NSURLSession *session;
/// taskIdentifier → loadingRequest（URLSession 回调侧查）
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, AVAssetResourceLoadingRequest *> *taskToRequest;
/// loadingRequest → task（取消侧直接查，免 getAllTasks 阻塞）
@property(nonatomic, strong) NSMapTable<AVAssetResourceLoadingRequest *, NSURLSessionTask *> *requestToTask;
/// taskIdentifier → 下一写入缓存的 offset
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, NSNumber *> *taskToWriteOffset;
/// taskIdentifier → 该响应是否可缓存（经 206/Content-Range 校验后置）
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, NSNumber *> *taskToCacheable;
@end

@implementation MFResourceLoader

- (instancetype)initWithCacheKey:(NSString *)cacheKey
                      streamType:(nullable NSString *)streamType
                          engine:(MFAudioEngine *)engine
                           queue:(dispatch_queue_t)queue
                           cache:(nullable MFMediaCache *)cache {
    if (self = [super init]) {
        _cacheKey = [cacheKey copy];
        _streamType = [streamType copy];
        _engine = engine;
        _queue = queue;
        _cache = cache;
        _resolvedHeaders = @{};
        _waitingForResolve = [NSMutableArray array];
        _taskToRequest = [NSMutableDictionary dictionary];
        _requestToTask = [NSMapTable strongToStrongObjectsMapTable];
        _taskToWriteOffset = [NSMutableDictionary dictionary];
        _taskToCacheable = [NSMutableDictionary dictionary];
        // URLSession：delegate 回调到后台并发队列，内部再 hop 到 self.queue 保状态串行
        NSURLSessionConfiguration *cfg = [NSURLSessionConfiguration defaultSessionConfiguration];
        cfg.requestCachePolicy = NSURLRequestReloadIgnoringLocalAndRemoteCacheData;  // 自管缓存，绕系统 URL cache
        _session = [NSURLSession sessionWithConfiguration:cfg delegate:self delegateQueue:nil];
    }
    return self;
}

- (void)invalidate {
    dispatch_async(self.queue, ^{
        self.invalidated = YES;
        NSError *cancel = [NSError errorWithDomain:@"fun.upup.musicfree.audio" code:NSURLErrorCancelled
                                          userInfo:@{NSLocalizedDescriptionKey: @"loader invalidated"}];
        for (AVAssetResourceLoadingRequest *req in self.waitingForResolve) {
            if (!req.isFinished) [req finishLoadingWithError:cancel];
        }
        [self.waitingForResolve removeAllObjects];
        [self.taskToRequest removeAllObjects];
        [self.requestToTask removeAllObjects];
        [self.taskToWriteOffset removeAllObjects];
        [self.taskToCacheable removeAllObjects];
        [self.session invalidateAndCancel];
    });
}

#pragma mark - AVAssetResourceLoaderDelegate（回调在 engine 传入的 self.queue 上）

- (BOOL)resourceLoader:(AVAssetResourceLoader *)resourceLoader
    shouldWaitForLoadingOfRequestedResource:(AVAssetResourceLoadingRequest *)loadingRequest {
    if (![loadingRequest.request.URL.scheme isEqualToString:MFPlaceholderScheme]) return NO;
    if (self.invalidated) return NO;

    if (self.resolveFailed) {
        [self finishRequest:loadingRequest withResolveError:nil];
        return YES;
    }
    if (self.resolved) {
        [self routeRequest:loadingRequest];
        return YES;
    }
    // 未解析：挂起、惰性触发一次解析
    [self.waitingForResolve addObject:loadingRequest];
    if (!self.resolving) [self triggerResolve];
    return YES;
}

- (void)resourceLoader:(AVAssetResourceLoader *)resourceLoader
    didCancelLoadingRequest:(AVAssetResourceLoadingRequest *)loadingRequest {
    [self.waitingForResolve removeObject:loadingRequest];
    [self cleanupRequest:loadingRequest];
}

/// 完成/取消某 loadingRequest：断开 task 映射并取消其下载
- (void)cleanupRequest:(AVAssetResourceLoadingRequest *)request {
    NSURLSessionTask *task = [self.requestToTask objectForKey:request];
    if (task) {
        [self.requestToTask removeObjectForKey:request];
        [self.taskToRequest removeObjectForKey:@(task.taskIdentifier)];
        [self.taskToWriteOffset removeObjectForKey:@(task.taskIdentifier)];
        [self.taskToCacheable removeObjectForKey:@(task.taskIdentifier)];
        [task cancel];
    }
}

#pragma mark - 解析

- (void)triggerResolve {
    self.resolving = YES;
    __weak typeof(self) weakSelf = self;
    [self.engine resolveCacheKey:self.cacheKey
                      completion:^(NSString *_Nullable url, NSDictionary<NSString *, NSString *> *headers) {
        __strong typeof(self) self = weakSelf;
        if (!self) return;
        dispatch_async(self.queue, ^{ [self handleResolvedURL:url headers:headers]; });
    }];
}

- (void)handleResolvedURL:(nullable NSString *)urlStr headers:(NSDictionary<NSString *, NSString *> *)headers {
    self.resolving = NO;
    if (self.invalidated) return;
    NSURL *url = urlStr.length ? [NSURL URLWithString:urlStr] : nil;
    if (!url) {
        self.resolveFailed = YES;
        NSArray *waiting = [self.waitingForResolve copy];
        [self.waitingForResolve removeAllObjects];
        for (AVAssetResourceLoadingRequest *req in waiting) [self finishRequest:req withResolveError:nil];
        return;
    }
    self.resolved = YES;
    self.resolvedURL = url;
    self.resolvedHeaders = headers ?: @{};
    NSArray *waiting = [self.waitingForResolve copy];
    [self.waitingForResolve removeAllObjects];
    for (AVAssetResourceLoadingRequest *req in waiting) [self routeRequest:req];
}

- (BOOL)isHLS { return [self.streamType isEqualToString:@"hls"]; }

/// 解析后按类型分发：hls→重定向真清单交原生 HLS；progressive→自抓字节
- (void)routeRequest:(AVAssetResourceLoadingRequest *)request {
    if (self.invalidated) return;
    if ([self isHLS]) [self respondRedirectForRequest:request];
    else [self startTaskForRequest:request];
}

/// HLS：把 loadingRequest 302 重定向到真实清单 URL，交 AVPlayer 原生 HLS（不缓存）
/// BLIND-WRITE: headers 经 redirect 请求尽力带，分片请求未必带（D3 允许降级）
- (void)respondRedirectForRequest:(AVAssetResourceLoadingRequest *)request {
    NSMutableURLRequest *redirect = [NSMutableURLRequest requestWithURL:self.resolvedURL];
    [self.resolvedHeaders enumerateKeysAndObjectsUsingBlock:^(NSString *k, NSString *v, BOOL *stop) {
        [redirect setValue:v forHTTPHeaderField:k];
    }];
    request.redirect = redirect;
    request.response = [[NSHTTPURLResponse alloc] initWithURL:self.resolvedURL statusCode:302
                                                  HTTPVersion:@"HTTP/1.1"
                                                 headerFields:@{@"Location": self.resolvedURL.absoluteString}];
    [request finishLoading];
}

#pragma mark - 抓取（progressive range）

- (void)startTaskForRequest:(AVAssetResourceLoadingRequest *)request {
    AVAssetResourceLoadingDataRequest *dr = request.dataRequest;

    // 缓存优先：内容信息 / 有限区间 命中则直接回、免联网
    BOOL cacheOn = self.cache && [self.engine cacheEnabledNow];
    if (cacheOn) {
        if (!dr && request.contentInformationRequest &&
            [self fillContentInfoFromCache:request.contentInformationRequest]) {
            [request finishLoading];
            return;
        }
        if (dr && !dr.requestsAllDataToEndOfResource) {
            long long start = dr.currentOffset;
            NSInteger len = (NSInteger)(dr.requestedOffset + dr.requestedLength - dr.currentOffset);
            NSData *cached = len > 0 ? [self.cache cachedDataForKey:self.cacheKey offset:start length:len] : nil;
            if (cached) {
                if (request.contentInformationRequest) [self fillContentInfoFromCache:request.contentInformationRequest];
                [dr respondWithData:cached];
                [request finishLoading];
                return;
            }
        }
    }

    // 联网抓取
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:self.resolvedURL];
    [self.resolvedHeaders enumerateKeysAndObjectsUsingBlock:^(NSString *k, NSString *v, BOOL *stop) {
        [req setValue:v forHTTPHeaderField:k];
    }];
    long long start = 0;
    if (dr) {
        start = dr.currentOffset;
        if (dr.requestsAllDataToEndOfResource) {
            [req setValue:[NSString stringWithFormat:@"bytes=%lld-", start] forHTTPHeaderField:@"Range"];
        } else {
            long long end = dr.requestedOffset + dr.requestedLength - 1;
            [req setValue:[NSString stringWithFormat:@"bytes=%lld-%lld", start, end] forHTTPHeaderField:@"Range"];
        }
    } else {
        [req setValue:@"bytes=0-1" forHTTPHeaderField:@"Range"];
    }
    NSURLSessionDataTask *task = [self.session dataTaskWithRequest:req];
    self.taskToRequest[@(task.taskIdentifier)] = request;
    self.taskToWriteOffset[@(task.taskIdentifier)] = @(start);
    [self.requestToTask setObject:task forKey:request];
    [task resume];
}

/// 缓存命中时填 contentInformationRequest
- (BOOL)fillContentInfoFromCache:(AVAssetResourceLoadingContentInformationRequest *)info {
    long long len = 0; NSString *type = nil;
    if ([self.cache contentInfoForKey:self.cacheKey length:&len type:&type]) {
        if (type) info.contentType = type;
        if (len > 0) info.contentLength = len;
        info.byteRangeAccessSupported = YES;
        return YES;
    }
    return NO;
}

#pragma mark - NSURLSessionDataDelegate（hop 到 self.queue 保状态串行）

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
didReceiveResponse:(NSURLResponse *)response
 completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
    __block NSURLSessionResponseDisposition disp = NSURLSessionResponseAllow;
    dispatch_sync(self.queue, ^{
        AVAssetResourceLoadingRequest *request = self.taskToRequest[@(dataTask.taskIdentifier)];
        if (!request) { disp = NSURLSessionResponseCancel; return; }
        long long expectedStart = [self.taskToWriteOffset[@(dataTask.taskIdentifier)] longLongValue];
        NSInteger status = [response isKindOfClass:[NSHTTPURLResponse class]]
            ? ((NSHTTPURLResponse *)response).statusCode : 200;
        long long crStart = -1, crTotal = -1;
        if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
            NSString *cr = ((NSHTTPURLResponse *)response).allHeaderFields[@"Content-Range"];
            if (cr) [self parseContentRange:cr start:&crStart total:&crTotal];
        }
        // 校验：能否服务给 AVPlayer + 能否写缓存（防服务器忽略 Range / 错误页污染缓存）
        BOOL ok = NO, cacheable = NO;
        if (status == 206) {
            ok = (crStart < 0) || (crStart == expectedStart);   // 起点匹配（或解析不出保守放行）
            cacheable = (crStart == expectedStart);
        } else if (status == 200) {
            ok = (expectedStart == 0);   // 服务器忽略 Range 返全量，仅本就从 0 才可用
            cacheable = ok;
        }
        if (!ok) {
            [request finishLoadingWithError:[NSError errorWithDomain:@"fun.upup.musicfree.audio" code:status
                userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithFormat:@"http %ld / range mismatch", (long)status]}]];
            [self cleanupRequest:request];
            disp = NSURLSessionResponseCancel;
            return;
        }
        BOOL canCache = cacheable && self.cache && [self.engine cacheEnabledNow];
        self.taskToCacheable[@(dataTask.taskIdentifier)] = @(canCache);
        if (request.contentInformationRequest) {
            [self fillContentInfo:request.contentInformationRequest fromResponse:response];
            if (canCache) {
                [self.cache storeContentInfoForKey:self.cacheKey
                                            length:request.contentInformationRequest.contentLength
                                              type:request.contentInformationRequest.contentType];
            }
        }
        if (!request.dataRequest) { [request finishLoading]; [self cleanupRequest:request]; disp = NSURLSessionResponseCancel; }
    });
    completionHandler(disp);
}

- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
    didReceiveData:(NSData *)data {
    dispatch_async(self.queue, ^{
        AVAssetResourceLoadingRequest *request = self.taskToRequest[@(dataTask.taskIdentifier)];
        AVAssetResourceLoadingDataRequest *dr = request.dataRequest;
        if (!dr) return;
        // 缓存写入：真实网络 offset 写整块（bytes 有效，独立于给 AVPlayer 的裁剪）
        if ([self.taskToCacheable[@(dataTask.taskIdentifier)] boolValue] && self.cache) {
            NSNumber *off = self.taskToWriteOffset[@(dataTask.taskIdentifier)];
            if (off) {
                [self.cache storeData:data forKey:self.cacheKey atOffset:off.longLongValue];
                self.taskToWriteOffset[@(dataTask.taskIdentifier)] = @(off.longLongValue + (long long)data.length);
            }
        }
        // 喂给 AVPlayer：有限区间裁剪到请求范围内（防服务器返 200 全量/206 超长喂溢出）
        NSData *toRespond = data;
        if (!dr.requestsAllDataToEndOfResource) {
            long long remaining = dr.requestedOffset + dr.requestedLength - dr.currentOffset;
            if (remaining <= 0) toRespond = nil;
            else if ((long long)data.length > remaining) toRespond = [data subdataWithRange:NSMakeRange(0, (NSUInteger)remaining)];
        }
        if (toRespond.length) [dr respondWithData:toRespond];
        // 有限区间满足即完成、取消多余下载
        if (!dr.requestsAllDataToEndOfResource &&
            dr.currentOffset >= dr.requestedOffset + dr.requestedLength) {
            [request finishLoading];
            [self cleanupRequest:request];
        }
    });
}

- (void)URLSession:(NSURLSession *)session
              task:(NSURLSessionTask *)task
didCompleteWithError:(nullable NSError *)error {
    dispatch_async(self.queue, ^{
        AVAssetResourceLoadingRequest *request = self.taskToRequest[@(task.taskIdentifier)];
        if (!request) return;
        [self.taskToRequest removeObjectForKey:@(task.taskIdentifier)];
        [self.requestToTask removeObjectForKey:request];
        [self.taskToWriteOffset removeObjectForKey:@(task.taskIdentifier)];
        [self.taskToCacheable removeObjectForKey:@(task.taskIdentifier)];
        if (error) {
            if (error.code == NSURLErrorCancelled) return;  // 主动取消/已满足，忽略
            [request finishLoadingWithError:error];
        } else {
            [request finishLoading];  // all-data 请求下到 EOF
        }
    });
}

#pragma mark - 辅助

/// 解析 "bytes start-end/total"；start/end 必须都是数字且非空才置 outStart（total 可为 * 未知）；否则 -1不缓存
- (void)parseContentRange:(NSString *)cr start:(long long *)outStart total:(long long *)outTotal {
    *outStart = -1; *outTotal = -1;
    NSRange sp = [cr rangeOfString:@" "];
    NSRange dash = [cr rangeOfString:@"-"];
    NSRange slash = [cr rangeOfString:@"/"];
    if (sp.location == NSNotFound || dash.location == NSNotFound || slash.location == NSNotFound ||
        dash.location <= sp.location + 1 || slash.location <= dash.location + 1) return;
    NSString *startStr = [cr substringWithRange:NSMakeRange(sp.location + 1, dash.location - sp.location - 1)];
    NSString *endStr = [cr substringWithRange:NSMakeRange(dash.location + 1, slash.location - dash.location - 1)];
    NSString *totalStr = slash.location + 1 < cr.length ? [cr substringFromIndex:slash.location + 1] : @"";
    if (![self isDigits:startStr] || ![self isDigits:endStr]) return;  // 起止必须都是数字
    *outStart = [startStr longLongValue];
    if ([self isDigits:totalStr] && [totalStr longLongValue] > 0) *outTotal = [totalStr longLongValue];
}

- (BOOL)isDigits:(NSString *)s {
    if (s.length == 0) return NO;
    return [s rangeOfCharacterFromSet:[[NSCharacterSet decimalDigitCharacterSet] invertedSet]].location == NSNotFound;
}

- (void)fillContentInfo:(AVAssetResourceLoadingContentInformationRequest *)info
           fromResponse:(NSURLResponse *)response {
    // contentType：MIME → UTType 标识（iOS14+）
    // BLIND-WRITE: UTType 映射与 byteRangeAccess 真机核对
    NSString *mime = response.MIMEType;
    if (mime) {
        UTType *t = [UTType typeWithMIMEType:mime];
        if (t.identifier) info.contentType = t.identifier;
    }
    long long total = response.expectedContentLength;  // 200 时=全长；206 时=剩余段长
    info.byteRangeAccessSupported = NO;
    if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
        NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
        NSString *contentRange = http.allHeaderFields[@"Content-Range"];
        if (contentRange) {
            // "bytes start-end/total" → 取 total 作全长
            NSRange slash = [contentRange rangeOfString:@"/"];
            if (slash.location != NSNotFound) {
                NSString *totalStr = [contentRange substringFromIndex:slash.location + 1];
                long long parsed = [totalStr longLongValue];
                if (parsed > 0) total = parsed;
            }
            info.byteRangeAccessSupported = YES;  // 服务器支持 range
        }
    }
    if (total > 0) info.contentLength = total;
}

- (void)finishRequest:(AVAssetResourceLoadingRequest *)request withResolveError:(nullable NSError *)err {
    NSError *e = err ?: [NSError errorWithDomain:@"fun.upup.musicfree.audio"
                                            code:-1
                                        userInfo:@{NSLocalizedDescriptionKey: @"resolve failed"}];
    [request finishLoadingWithError:e];
}

@end
