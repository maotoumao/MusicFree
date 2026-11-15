import ActivityKit
import Foundation

/**
 * Shared between the app (which starts and updates the activity) and the
 * widget extension (which renders it). Keep this file in both targets.
 *
 * Song metadata lives in ContentState rather than Attributes so a Live Activity
 * can switch songs while the app is in the background; ending and requesting a
 * new activity is only allowed while the app is foreground.
 */
@available(iOS 16.1, *)
struct MusicFreeActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var title: String
        var artist: String
        /// The lyric line currently being played. Empty when no lyric exists.
        var lyricLine: String
        /// Surrounding lines, so the expanded island can show a three-line window.
        var previousLine: String
        var nextLine: String
        /// Playback progress, from 0 to 1.
        var progress: Double
        var isPlaying: Bool
    }
}
