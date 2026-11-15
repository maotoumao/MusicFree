import ActivityKit
import Foundation
import MediaPlayer
import UIKit

/**
 * Bridges the Android-only "status bar lyric" to an iOS Live Activity shown on
 * the lock screen and in the Dynamic Island.
 *
 * The JS layer already calls LyricUtil.setStatusBarLyricText() for every lyric
 * line; this class turns those calls into Live Activity updates. Song title and
 * artist are read from MPNowPlayingInfoCenter, which react-native-track-player
 * keeps up to date.
 */
@available(iOS 16.2, *)
@objcMembers
final class MFLiveActivity: NSObject {
    private static var enabled = false
    private static var latestLyric = ""
    private static var latestTitle = ""
    private static var latestArtist = ""
    private static var updateChain = Task {}

    /// Whether the user allows Live Activities for this app in system settings.
    @objc static func isSupported() -> Bool {
        return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// Called when the "Live Activity lyrics" switch is turned on.
    @objc static func show(lyric: String) {
        enabled = true
        latestLyric = lyric
        sync()
    }

    /// Called for every lyric line while the feature is enabled.
    @objc static func update(lyric: String) {
        latestLyric = lyric
        sync()
    }

    /// Called when the switch is turned off (or by tear-down code).
    @objc static func end() {
        enabled = false
        let activities = Activity<MusicFreeActivityAttributes>.activities
        Task {
            for activity in activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    private static func sync() {
        guard enabled, ActivityAuthorizationInfo().areActivitiesEnabled else {
            return
        }

        if let nowPlaying = currentNowPlaying() {
            latestTitle = nowPlaying.title
            latestArtist = nowPlaying.artist
        }

        if let activity = Activity<MusicFreeActivityAttributes>.activities.first {
            updateContent(of: activity)
            return
        }

        // A Live Activity can only be requested while the app is foreground.
        // If playback starts while the app is backgrounded, the next lyric
        // update after returning to the app will create it.
        guard !latestTitle.isEmpty,
            UIApplication.shared.applicationState == .active else {
            return
        }
        start()
    }

    private static func start() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            return
        }
        let content = makeContent()
        do {
            _ = try Activity.request(
                attributes: MusicFreeActivityAttributes(),
                content: content,
                pushType: nil
            )
        } catch {
            // Requesting can fail when the app is not foreground or when the
            // user has used up the Live Activity budget; the next update retries.
        }
    }

    private static func updateContent(
        of activity: Activity<MusicFreeActivityAttributes>
    ) {
        // Chain updates so a slower, older update can never overwrite a newer
        // lyric line.
        let previous = updateChain
        let content = makeContent()
        updateChain = Task {
            _ = await previous.value
            await activity.update(content)
        }
    }

    private static func makeContent() -> ActivityContent<MusicFreeActivityAttributes.ContentState> {
        let state = MusicFreeActivityAttributes.ContentState(
            title: latestTitle.isEmpty ? "MusicFree" : latestTitle,
            artist: latestArtist,
            lyric: latestLyric
        )
        // Keep the activity around for a while after playback stops so the last
        // lyric line does not disappear immediately when the screen locks.
        return ActivityContent(
            state: state,
            staleDate: Date().addingTimeInterval(60 * 60)
        )
    }

    private struct NowPlaying {
        let title: String
        let artist: String
    }

    private static func currentNowPlaying() -> NowPlaying? {
        guard let info = MPNowPlayingInfoCenter.default().nowPlayingInfo else {
            return nil
        }
        let title = info[MPMediaItemPropertyTitle] as? String ?? ""
        guard !title.isEmpty else {
            return nil
        }
        let artist = info[MPMediaItemPropertyArtist] as? String ?? ""
        return NowPlaying(title: title, artist: artist)
    }
}
