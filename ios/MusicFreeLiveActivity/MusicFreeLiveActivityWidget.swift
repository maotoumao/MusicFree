import ActivityKit
import SwiftUI
import WidgetKit

struct MusicFreeLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MusicFreeActivityAttributes.self) { context in
            LockScreenLyricView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.72))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "music.note")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .padding(.leading, 8)
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(spacing: 2) {
                        Text(context.state.title)
                            .font(.headline)
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        Text(lyricText(context))
                            .font(.subheadline)
                            .foregroundStyle(.white.opacity(0.9))
                            .lineLimit(2)
                            .multilineTextAlignment(.center)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if !context.state.artist.isEmpty {
                        Text(context.state.artist)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: "music.note")
                    .foregroundStyle(.white)
            } compactTrailing: {
                Text(lyricText(context))
                    .font(.caption2)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .frame(maxWidth: 64)
            } minimal: {
                Image(systemName: "music.note")
                    .foregroundStyle(.white)
            }
            .keylineTint(.pink)
        }
    }

    private func lyricText(_ context: ActivityViewContext<MusicFreeActivityAttributes>) -> String {
        return MusicFreeLiveActivityWidget.lyricText(context)
    }

    static func lyricText(_ context: ActivityViewContext<MusicFreeActivityAttributes>) -> String {
        let lyric = context.state.lyric.trimmingCharacters(in: .whitespacesAndNewlines)
        return lyric.isEmpty ? "MusicFree" : lyric
    }
}

private struct LockScreenLyricView: View {
    let context: ActivityViewContext<MusicFreeActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "music.note")
                Text(context.state.title)
                    .font(.headline)
                    .lineLimit(1)
                Spacer()
            }
            .foregroundStyle(.white)

            Text(lyricText)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .center)

            if !context.state.artist.isEmpty {
                Text(context.state.artist)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
        }
        .padding(16)
    }

    private var lyricText: String {
        let lyric = context.state.lyric.trimmingCharacters(in: .whitespacesAndNewlines)
        return lyric.isEmpty ? "MusicFree" : lyric
    }
}
