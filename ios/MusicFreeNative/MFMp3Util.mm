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

static void MFReadExtendedMeta(AVAsset *asset, NSMutableDictionary *meta)
{
    // Lyrics and comments live in format-specific metadata (the iTunes atoms
    // for m4a), not in `commonMetadata`.
    for (AVMetadataFormat format in asset.availableMetadataFormats) {
        for (AVMetadataItem *item in [asset metadataForFormat:format]) {
            NSString *identifier = item.identifier ?: @"";
            if ([identifier isEqualToString:AVMetadataIdentifieriTunesMetadataUserComment]) {
                MFPutIfPresent(meta, @"comment", item.value);
            } else if ([identifier isEqualToString:AVMetadataIdentifieriTunesMetadataLyrics] ||
                       [identifier containsString:@"lyric"]) {
                MFPutIfPresent(meta, @"lyric", item.value);
            }
        }
    }
}

static AVMutableMetadataItem *MFMetadataItem(AVMetadataIdentifier identifier, NSString *value)
{
    AVMutableMetadataItem *item = [AVMutableMetadataItem metadataItem];
    item.identifier = identifier;
    item.value = value;
    return item;
}

static void MFAppendStringItem(NSMutableArray<AVMetadataItem *> *items,
                               NSString *key,
                               NSDictionary *meta,
                               AVMetadataIdentifier identifier)
{
    if (meta[key] == nil) {
        return;
    }
    NSString *value = MFStringValue(meta[key]);
    // An explicit empty string clears the tag.
    if (value.length > 0) {
        [items addObject:MFMetadataItem(identifier, value)];
    }
}

static NSArray<AVMetadataItem *> *MFMergedMetadata(AVURLAsset *asset, NSDictionary *meta)
{
    NSMutableArray<AVMetadataItem *> *items = [NSMutableArray array];
    BOOL replacesTitle = meta[@"title"] != nil;
    BOOL replacesArtist = meta[@"artist"] != nil;
    BOOL replacesAlbum = meta[@"album"] != nil;
    BOOL replacesComment = meta[@"comment"] != nil;
    BOOL replacesLyric = meta[@"lyric"] != nil;

    // Preserve artwork and any other common metadata, replacing only the
    // fields the caller asked to change.
    for (AVMetadataItem *item in asset.commonMetadata) {
        NSString *commonKey = item.commonKey;
        if (replacesTitle && [commonKey isEqualToString:AVMetadataCommonKeyTitle]) {
            continue;
        }
        if (replacesArtist && [commonKey isEqualToString:AVMetadataCommonKeyArtist]) {
            continue;
        }
        if (replacesAlbum && [commonKey isEqualToString:AVMetadataCommonKeyAlbumName]) {
            continue;
        }
        [items addObject:item];
    }

    // Preserve iTunes metadata that is not part of commonMetadata (track
    // number, genre, ...). Items mirrored in commonMetadata are skipped so the
    // output does not contain duplicate atoms.
    for (AVMetadataItem *item in [asset metadataForFormat:AVMetadataFormatiTunesMetadata]) {
        NSString *identifier = item.identifier ?: @"";
        if (replacesLyric && [identifier isEqualToString:AVMetadataIdentifieriTunesMetadataLyrics]) {
            continue;
        }
        if (replacesComment &&
            [identifier isEqualToString:AVMetadataIdentifieriTunesMetadataUserComment]) {
            continue;
        }
        if (item.commonKey.length > 0) {
            continue;
        }
        [items addObject:item];
    }

    MFAppendStringItem(items, @"title", meta, AVMetadataCommonIdentifierTitle);
    MFAppendStringItem(items, @"artist", meta, AVMetadataCommonIdentifierArtist);
    MFAppendStringItem(items, @"album", meta, AVMetadataCommonIdentifierAlbumName);
    MFAppendStringItem(items, @"comment", meta, AVMetadataIdentifieriTunesMetadataUserComment);
    MFAppendStringItem(items, @"lyric", meta, AVMetadataIdentifieriTunesMetadataLyrics);

    return items;
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

        MFReadExtendedMeta(asset, meta);
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
        NSMutableDictionary *basic = [NSMutableDictionary dictionary];
        for (NSString *key in @[ @"title", @"artist", @"album", @"author", @"duration", @"date" ]) {
            if (meta[key]) {
                basic[key] = meta[key];
            }
        }
        resolve(basic);
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
        for (NSString *key in @[ @"title", @"artist", @"album", @"comment", @"lyric" ]) {
            if (meta[key]) {
                tags[key] = meta[key];
            }
        }
        resolve(tags);
    });
}

/**
 * AVFoundation can rewrite the metadata container it owns (m4a/mp4) but cannot
 * write ID3 frames, so MP3 tag editing is reported as unsupported for now.
 *
 * The export goes to a temporary file next to the original and only replaces
 * the original after the export completed, so a failure never corrupts it.
 */
RCT_EXPORT_METHOD(setMediaTag : (NSString *)filePath
                  meta : (NSDictionary *)meta
                  resolver : (RCTPromiseResolveBlock)resolve
                  rejecter : (RCTPromiseRejectBlock)reject)
{
    NSURL *url = MFMediaURL(filePath);
    if (!url || ![[NSFileManager defaultManager] fileExistsAtPath:url.path]) {
        reject(@"Error", @"File not found", nil);
        return;
    }

    NSString *extension = url.pathExtension.lowercaseString;
    if (![extension isEqualToString:@"m4a"] && ![extension isEqualToString:@"mp4"]) {
        reject(
            @"Unsupported",
            [NSString stringWithFormat:
                @"Writing tags is not supported for .%@ files on iOS; only m4a and mp4 are supported",
                extension.length > 0 ? extension : @"unknown"],
            nil);
        return;
    }

    if (![meta isKindOfClass:[NSDictionary class]]) {
        reject(@"Error", @"Invalid metadata", nil);
        return;
    }

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:nil];
        NSArray<AVMetadataItem *> *metadata = MFMergedMetadata(asset, meta);

        NSString *tempName = [NSString stringWithFormat:@".%@.%@.tmp",
                              url.lastPathComponent,
                              [[NSUUID UUID] UUIDString]];
        NSURL *tempURL = [url.URLByDeletingLastPathComponent URLByAppendingPathComponent:tempName];

        AVAssetExportSession *session =
            [[AVAssetExportSession alloc] initWithAsset:asset
                                             presetName:AVAssetExportPresetPassthrough];
        if (!session) {
            reject(@"Unsupported", @"This file cannot be rewritten by AVFoundation", nil);
            return;
        }

        session.outputURL = tempURL;
        session.outputFileType = [extension isEqualToString:@"m4a"] ? AVFileTypeAppleM4A : AVFileTypeMPEG4;
        session.metadata = metadata;
        session.shouldOptimizeForNetworkUse = NO;

        [session exportAsynchronouslyWithCompletionHandler:^{
            NSFileManager *fileManager = [NSFileManager defaultManager];
            if (session.status != AVAssetExportSessionStatusCompleted) {
                [fileManager removeItemAtURL:tempURL error:nil];
                NSError *error = session.error;
                reject(
                    @"ExportFailed",
                    error.localizedDescription ?: @"Failed to rewrite media metadata",
                    error);
                return;
            }

            NSError *replaceError = nil;
            BOOL replaced = [fileManager replaceItemAtURL:url
                                            withItemAtURL:tempURL
                                           backupItemName:nil
                                                  options:0
                                         resultingItemURL:nil
                                                    error:&replaceError];
            if (!replaced) {
                [fileManager removeItemAtURL:tempURL error:nil];
                reject(
                    @"ReplaceFailed",
                    replaceError.localizedDescription ?: @"Failed to replace the original file",
                    replaceError);
                return;
            }

            resolve(nil);
        }];
    });
}

@end
