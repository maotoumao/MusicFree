import ActivityKit
import Foundation
import MediaPlayer
import UIKit

/**
 * Bridges the Android-only "status bar lyric" to an iOS Live Activity shown on
 * the lock screen and in the Dynamic Island.
 *
 * The JS layer calls `update(lyric:previousLine:nextLine:progress:)` for every
 * lyric line. Updates are coalesced to at most one per second because Live
 * Activities have a limited update budget. Playback state comes from the JS
 * event listener so the activity can show a correct play/pause button.
 */
@available(iOS 16.1, *)
@objcMembers
@objc(MFLiveActivity)
final class MFLiveActivity: NSObject {
    private static let minUpdateInterval: TimeInterval = 1.0

    private static var enabled = false
    private static var latestLyric = ""
    private static var latestPreviousLine = ""
    private static var latestNextLine = ""
    private static var latestTitle = ""
    private static var latestArtist = ""
    private static var latestProgress: Double = 0
    private static var latestIsPlaying = false

    private static var lastUpdateAt = Date.distantPast
    private static var pendingUpdate: Task<Void, Never>?
    private static var updateChain = Task<Void, Never> {}

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
    @objc static func update(
        lyric: String,
        previousLine: String,
        nextLine: String,
        progress: NSNumber?
    ) {
        latestLyric = lyric
        latestPreviousLine = previousLine
        latestNextLine = nextLine
        if let progress = progress {
            latestProgress = min(max(progress.doubleValue, 0), 1)
        }
        sync()
    }

    /// Called when play/pause changes. Pausing keeps the activity but updates
    /// the button, so the user can resume from the lock screen.
    @objc static func setPlaying(_ isPlaying: Bool) {
        guard latestIsPlaying != isPlaying else {
            return
        }
        latestIsPlaying = isPlaying
        sync()
    }

    /// Called when the switch is turned off.
    @objc static func end() {
        enabled = false
        resetContent()
        endAllActivities(reason: "disabled")
    }

    /// Called when playback stops but the feature stays enabled.
    @objc static func endActivity() {
        resetContent()
        endAllActivities(reason: "playback-ended")
    }

    /// Called once on cold launch. An activity survives the process, so any
    /// activity found before the JS layer starts is a leftover from a previous
    /// session and must be removed.
    @objc static func cleanupOrphans() {
        let activities = Activity<MusicFreeActivityAttributes>.activities
        guard !activities.isEmpty else {
            return
        }
        endActivities(activities, reason: "orphan-cleanup")
    }

    private static func resetContent() {
        latestLyric = ""
        latestPreviousLine = ""
        latestNextLine = ""
        latestProgress = 0
        latestIsPlaying = false
        pendingUpdate?.cancel()
        pendingUpdate = nil
        lastUpdateAt = Date.distantPast
    }

    private static func sync() {
        guard enabled, isSupported() else {
            return
        }

        refreshNowPlaying()

        if let activity = Activity<MusicFreeActivityAttributes>.activities.first {
            scheduleUpdate(of: activity)
            return
        }

        // A Live Activity can only be requested while the app is foreground.
        // Do not create one just because a restored track has metadata; wait
        // until playback actually starts (or resumes). If playback starts while
        // the app is backgrounded, the next update after returning creates it.
        guard latestIsPlaying, !latestTitle.isEmpty,
            UIApplication.shared.applicationState == .active else {
            return
        }
        start()
    }

    private static func start() {
        guard isSupported() else {
            return
        }
        let state = makeState()
        do {
            if #available(iOS 16.2, *) {
                _ = try Activity.request(
                    attributes: MusicFreeActivityAttributes(),
                    content: ActivityContent(state: state, staleDate: staleDate()),
                    pushType: nil
                )
            } else {
                _ = try Activity.request(
                    attributes: MusicFreeActivityAttributes(),
                    contentState: state,
                    pushType: nil
                )
            }
            lastUpdateAt = Date()
            debugLog("start title=\(latestTitle) lyric=\(latestLyric)")
        } catch {
            // Requesting can fail when the app is not foreground or when the
            // user has used up the Live Activity budget; the next update retries.
        }
    }

    /// Coalesce lyric updates to at most one call per second. A burst of short
    /// lyric lines collapses into the latest state instead of exhausting the
    /// system update budget.
    private static func scheduleUpdate(
        of activity: Activity<MusicFreeActivityAttributes>
    ) {
        let elapsed = Date().timeIntervalSince(lastUpdateAt)
        if elapsed >= minUpdateInterval {
            performUpdate(of: activity)
            return
        }

        pendingUpdate?.cancel()
        let delay = minUpdateInterval - elapsed
        pendingUpdate = Task {
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            guard !Task.isCancelled else {
                return
            }
            performUpdate(of: activity)
        }
    }

    private static func performUpdate(
        of activity: Activity<MusicFreeActivityAttributes>
    ) {
        pendingUpdate = nil
        lastUpdateAt = Date()
        let state = makeState()
        debugLog(
            "update lyric=\(latestLyric) prev=\(latestPreviousLine) next=\(latestNextLine) playing=\(latestIsPlaying) progress=\(latestProgress)"
        )

        let previous = updateChain
        updateChain = Task {
            _ = await previous.value
            if #available(iOS 16.2, *) {
                await activity.update(
                    ActivityContent(state: state, staleDate: staleDate())
                )
            } else {
                await activity.update(using: state)
            }
        }
    }

    private static func makeState() -> MusicFreeActivityAttributes.ContentState {
        return MusicFreeActivityAttributes.ContentState(
            title: latestTitle.isEmpty ? "MusicFree" : latestTitle,
            artist: latestArtist,
            lyricLine: latestLyric,
            previousLine: latestPreviousLine,
            nextLine: latestNextLine,
            progress: latestProgress,
            isPlaying: latestIsPlaying
        )
    }

    /// Keep the activity around for a while after playback stops so the last
    /// lyric line does not disappear immediately when the screen locks.
    private static func staleDate() -> Date {
        return Date().addingTimeInterval(60 * 60)
    }

    private static func endAllActivities(reason: String) {
        let activities = Activity<MusicFreeActivityAttributes>.activities
        guard !activities.isEmpty else {
            return
        }
        endActivities(activities, reason: reason)
    }

    private static func endActivities(
        _ activities: [Activity<MusicFreeActivityAttributes>],
        reason: String
    ) {
        debugLog("end count=\(activities.count) reason=\(reason)")
        Task {
            for activity in activities {
                if #available(iOS 16.2, *) {
                    await activity.end(nil, dismissalPolicy: .immediate)
                } else {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
        }
    }

    private static func refreshNowPlaying() {
        guard let info = MPNowPlayingInfoCenter.default().nowPlayingInfo else {
            return
        }
        let title = info[MPMediaItemPropertyTitle] as? String ?? ""
        guard !title.isEmpty else {
            return
        }
        latestTitle = title
        latestArtist = info[MPMediaItemPropertyArtist] as? String ?? ""
    }

    private static func debugLog(_ message: String) {
        #if DEBUG
        NSLog("[MFLiveActivity] \(message)")
        #endif
    }
}
