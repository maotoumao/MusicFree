//
//  NativeSharedStorage.mm
//  MusicFree —— SharedStorage TurboModule iOS 实现（New Architecture）
//
//  iOS 无 MediaStore，也无公共「下载」目录，文件落到 app 的 Documents。
//  ⚠ 当前它对用户**不可见**：Info.plist 未开 UIFileSharingEnabled，而且不能贸然开——
//  iOS 的 basePath 就是 Documents，其下已有 mmkv/、plugins/、download/ 等内部状态，
//  开启文件共享会把它们一并暴露给用户并允许删改。要让备份可见，需先把内部状态迁到
//  Library/Application Support，或改走文档导出器 / 分享面板由用户选位置。此决策待定。
//  定位方向上 iOS 无 content://，URI 到路径是平凡映射，只需还原并校验可读。
//  BLIND-WRITE：方法签名与 SpecJSI 名需 Mac 上 pod install 生成 MusicFreeSpecs 后核对（见 .h）。
//

#import "NativeSharedStorage.h"

@implementation NativeSharedStorage

RCT_EXPORT_MODULE()

- (void)saveToDownloads:(NSString *)sourcePath
               fileName:(NSString *)fileName
               mimeType:(NSString *)mimeType
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject {
    // 拷贝可能是数十 MB，别占住调用线程
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
        NSFileManager *fm = [NSFileManager defaultManager];
        if (![fm fileExistsAtPath:sourcePath]) {
            reject(@"E_SAVE_TO_DOWNLOADS",
                   [NSString stringWithFormat:@"source file not found: %@", sourcePath],
                   nil);
            return;
        }

        NSURL *dir = [[fm URLsForDirectory:NSDocumentDirectory
                                 inDomains:NSUserDomainMask] firstObject];
        if (dir == nil) {
            reject(@"E_SAVE_TO_DOWNLOADS", @"documents directory unavailable", nil);
            return;
        }

        // 让出已占用的文件名，避免覆盖用户已有文件（与 Android 侧行为一致）
        NSString *base = [fileName stringByDeletingPathExtension];
        NSString *ext = [fileName pathExtension];
        NSURL *target = [dir URLByAppendingPathComponent:fileName];
        NSUInteger serial = 1;
        while ([fm fileExistsAtPath:target.path]) {
            NSString *candidate = ext.length == 0
                ? [NSString stringWithFormat:@"%@(%lu)", base, (unsigned long)serial]
                : [NSString stringWithFormat:@"%@(%lu).%@", base, (unsigned long)serial, ext];
            target = [dir URLByAppendingPathComponent:candidate];
            serial += 1;
        }

        NSError *error = nil;
        BOOL ok = [fm copyItemAtURL:[NSURL fileURLWithPath:sourcePath]
                              toURL:target
                              error:&error];
        if (!ok) {
            reject(@"E_SAVE_TO_DOWNLOADS", error.localizedDescription, error);
            return;
        }
        resolve(target.absoluteString);
    });
}

- (void)findReadableFilePath:(NSString *)fileLocation
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject {
    // 无 provider 可查，纯路径判定，开销极小，不必换线程
    NSString *path = nil;
    if ([fileLocation hasPrefix:@"/"]) {
        path = fileLocation;
    } else {
        NSURL *url = [NSURL URLWithString:fileLocation];
        // 仅 file:// 有对应的本地文件；其余 scheme 无路径可言
        if ([url.scheme.lowercaseString isEqualToString:@"file"]) {
            path = url.path;  // 已解码百分号转义
        }
    }
    if (path.length == 0) {
        resolve(@"");
        return;
    }

    NSFileManager *fm = [NSFileManager defaultManager];
    if (![fm isReadableFileAtPath:path]) {
        resolve(@"");
        return;
    }
    // 与 Android 的 isFile 对齐：目录、FIFO、设备节点等都不是可读取的音频文件
    NSDictionary *attrs = [fm attributesOfItemAtPath:path error:nil];
    if (![attrs[NSFileType] isEqualToString:NSFileTypeRegular]) {
        resolve(@"");
        return;
    }
    // 与 Android 的 canonicalPath 对齐：解符号链接，使同一文件恒得同一路径
    resolve([path stringByResolvingSymlinksInPath]);
}

#pragma mark - TurboModule

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeSharedStorageSpecJSI>(params);
}

@end
