#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>

@interface Mp3Util : NSObject <RCTBridgeModule>
@end

@implementation Mp3Util

RCT_EXPORT_MODULE(Mp3Util)

+ (BOOL)requiresMainQueueSetup
{
    return NO;
}

static NSURL *MFMediaURL(NSString *path)
{
    if (path.length == 0) {
        return nil;
    }
    if ([path hasPrefix:@"file://"]) {
        return [NSURL URLWithString:path];
    }
    return [NSURL fileURLWithPath:path];
}

static NSString *MFStringValue(id value)
{
    if ([value isKindOfClass:[NSString class]]) {
        return value;
    }
    if ([value isKindOfClass:[NSNumber class]]) {
        return [value stringValue];
    }
    return nil;
}

static void MFPutIfPresent(NSMutableDictionary *dict, NSString *key, id value)
{
    NSString *stringValue = MFStringValue(value);
    if (stringValue.length > 0) {
        dict[key] = stringValue;
    }
}

static NSString *MFLyricFromMetadata(NSArray<AVMetadataItem *> *metadata)
{
    for (AVMetadataItem *item in metadata) {
        NSString *identifier = item.identifier ?: @"";
        if ([identifier containsString:@"lyric"]) {
            NSString *value = MFStringValue(item.value);
            if (value.length > 0) {
                return value;
            }
        }
    }
    return nil;
}

static void MFReadMeta(NSURL *url, void (^completion)(NSDictionary *meta))
{
    AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:nil];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        NSMutableDictionary *meta = [NSMutableDictionary dictionary];

        double durationMs = CMTimeGetSeconds(asset.duration) * 1000.0;
        if (durationMs > 0 && !isnan(durationMs)) {
            meta[@"duration"] = [NSString stringWithFormat:@"%.0f", durationMs];
        }

        for (AVMetadataItem *item in asset.commonMetadata) {
            id key = item.commonKey;
            if ([key isEqualToString:AVMetadataCommonKeyTitle]) {
                MFPutIfPresent(meta, @"title", item.value);
            } else if ([key isEqualToString:AVMetadataCommonKeyArtist]) {
                MFPutIfPresent(meta, @"artist", item.value);
            } else if ([key isEqualToString:AVMetadataCommonKeyAlbumName]) {
                MFPutIfPresent(meta, @"album", item.value);
            } else if ([key isEqualToString:AVMetadataCommonKeyCreator]) {
                MFPutIfPresent(meta, @"author", item.value);
            } else if ([key isEqualToString:AVMetadataCommonKeyCreationDate]) {
                MFPutIfPresent(meta, @"date", item.value);
            }
        }

        for (AVMetadataFormat format in asset.availableMetadataFormats) {
            NSArray<AVMetadataItem *> *metadata = [asset metadataForFormat:format];
            NSString *lyric = MFLyricFromMetadata(metadata);
            if (lyric.length > 0) {
                meta[@"lyric"] = lyric;
                break;
            }
        }

        completion(meta);
    });
}

RCT_EXPORT_METHOD(getBasicMeta : (NSString *)filePath
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    NSURL *url = MFMediaURL(filePath);
    if (!url || ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
        reject(@"Error", @"File not found", nil);
        return;
    }
    MFReadMeta(url, ^(NSDictionary *meta) {
        resolve(meta);
    });
}

RCT_EXPORT_METHOD(getMediaMeta : (NSArray<NSString *> *)filePaths
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    NSMutableArray *results = [NSMutableArray arrayWithCapacity:filePaths.count];
    for (NSUInteger index = 0; index < filePaths.count; index++) {
        [results addObject:[NSNull null]];
    }

    dispatch_group_t group = dispatch_group_create();
    for (NSUInteger index = 0; index < filePaths.count; index++) {
        NSURL *url = MFMediaURL(filePaths[index]);
        if (!url || ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
            continue;
        }
        dispatch_group_enter(group);
        MFReadMeta(url, ^(NSDictionary *meta) {
            results[index] = meta;
            dispatch_group_leave(group);
        });
    }
    dispatch_group_notify(group, dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        resolve(results);
    });
}

RCT_EXPORT_METHOD(getMediaCoverImg : (NSString *)filePath
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    NSURL *url = MFMediaURL(filePath);
    if (!url || ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
        reject(@"File not exist", @"File not exist", nil);
        return;
    }

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:nil];
        NSData *artworkData = nil;
        for (AVMetadataItem *item in asset.commonMetadata) {
            if ([item.commonKey isEqualToString:AVMetadataCommonKeyArtwork]) {
                id value = item.value;
                if ([value isKindOfClass:[NSData class]]) {
                    artworkData = value;
                } else if ([value isKindOfClass:[NSDictionary class]]) {
                    artworkData = value[@"data"];
                }
                if (artworkData.length > 0) {
                    break;
                }
            }
        }

        if (artworkData.length == 0) {
            resolve([NSNull null]);
            return;
        }

        NSString *cacheRoot = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) firstObject];
        NSString *coverDir = [cacheRoot stringByAppendingPathComponent:@"image_manager_disk_cache"];
        [[NSFileManager defaultManager] createDirectoryAtPath:coverDir
                                  withIntermediateDirectories:YES
                                                   attributes:nil
                                                        error:nil];
        NSString *name = [NSString stringWithFormat:@"%lu.jpg", (unsigned long)filePath.hash];
        NSString *coverPath = [coverDir stringByAppendingPathComponent:name];
        if ([artworkData writeToFile:coverPath atomically:YES]) {
            resolve([NSURL fileURLWithPath:coverPath].absoluteString);
        } else {
            reject(@"Error", @"Failed to write cover image", nil);
        }
    });
}

RCT_EXPORT_METHOD(getLyric : (NSString *)filePath
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    NSURL *url = MFMediaURL(filePath);
    if (!url || ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
        reject(@"Error", @"File not found", nil);
        return;
    }
    MFReadMeta(url, ^(NSDictionary *meta) {
        NSString *lyric = meta[@"lyric"];
        resolve(lyric.length > 0 ? lyric : [NSNull null]);
    });
}

RCT_EXPORT_METHOD(getMediaTag : (NSString *)filePath
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    NSURL *url = MFMediaURL(filePath);
    if (!url || ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
        reject(@"Error", @"File not found", nil);
        return;
    }
    MFReadMeta(url, ^(NSDictionary *meta) {
        NSMutableDictionary *tags = [NSMutableDictionary dictionary];
        for (NSString *key in @[ @"title", @"artist", @"album", @"lyric" ]) {
            if (meta[key]) {
                tags[key] = meta[key];
            }
        }
        resolve(tags);
    });
}

/**
 * AVFoundation can rewrite metadata containers it owns (m4a/mp4) but cannot
 * write ID3 frames, so MP3 tag editing is reported as unsupported for now.
 */
RCT_EXPORT_METHOD(setMediaTag : (NSString *)filePath
                  meta : (NSDictionary *)meta
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    NSString *extension = MFMediaURL(filePath).pathExtension.lowercaseString;
    if (![extension isEqualToString:@"m4a"] && ![extension isEqualToString:@"mp4"]) {
        reject(@"Unsupported", @"Writing tags is not supported for this format on iOS", nil);
        return;
    }
    reject(@"Unsupported", @"Tag writing is not implemented yet", nil);
}

@end
