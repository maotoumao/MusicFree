import Foundation
import React

/**
 * Swift implementation of the LyricUtil native module declared in
 * MFLyricUtil.mm. Forwards the Android status bar lyric API to a Live Activity.
 */
@objc(LyricUtil)
final class LyricUtil: NSObject {
    @objc static func requiresMainQueueSetup() -> Bool {
        return false
    }

    @objc func methodQueue() -> DispatchQueue {
        return DispatchQueue.main
    }

    @objc(checkSystemAlertPermission:rejecter:)
    func checkSystemAlertPermission(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.2, *) {
            resolve(MFLiveActivity.isSupported())
        } else {
            resolve(false)
        }
    }

    @objc(requestSystemAlertPermission:rejecter:)
    func requestSystemAlertPermission(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // Live Activities have no permission prompt; the user has to enable
        // them in Settings. Report the current state so JS can show a hint.
        if #available(iOS 16.2, *) {
            resolve(MFLiveActivity.isSupported())
        } else {
            resolve(false)
        }
    }

    @objc(showStatusBarLyric:config:resolver:rejecter:)
    func showStatusBarLyric(
        _ lyric: String?,
        config: [String: Any]?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.2, *) {
            MFLiveActivity.show(lyric: lyric ?? "")
            resolve(nil)
        } else {
            reject(
                "Unsupported",
                "Live Activity lyrics require iOS 16.2 or later",
                nil
            )
        }
    }

    @objc(hideStatusBarLyric:rejecter:)
    func hideStatusBarLyric(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.2, *) {
            MFLiveActivity.end()
        }
        resolve(nil)
    }

    @objc(setStatusBarLyricText:resolver:rejecter:)
    func setStatusBarLyricText(
        _ lyric: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        if #available(iOS 16.2, *) {
            MFLiveActivity.update(lyric: lyric ?? "")
        }
        resolve(nil)
    }

    @objc(setStatusBarLyricTop:resolver:rejecter:)
    func setStatusBarLyricTop(
        _ percent: Double,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(nil)
    }

    @objc(setStatusBarLyricLeft:resolver:rejecter:)
    func setStatusBarLyricLeft(
        _ percent: Double,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(nil)
    }

    @objc(setStatusBarLyricWidth:resolver:rejecter:)
    func setStatusBarLyricWidth(
        _ percent: Double,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(nil)
    }

    @objc(setStatusBarLyricFontSize:resolver:rejecter:)
    func setStatusBarLyricFontSize(
        _ fontSize: Double,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(nil)
    }

    @objc(setStatusBarLyricAlign:resolver:rejecter:)
    func setStatusBarLyricAlign(
        _ alignment: Double,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(nil)
    }

    @objc(setStatusBarColors:backgroundColor:resolver:rejecter:)
    func setStatusBarColors(
        _ textColor: String?,
        backgroundColor: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(nil)
    }
}
