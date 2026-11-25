import ActivityKit
import SwiftUI
import WidgetKit

private let togglePlayURL = URL(string: "musicfree://toggle-play")!

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
                    ThreeLineLyricView(
                        previousLine: context.state.previousLine,
                        currentLine: currentLine(context),
                        nextLine: context.state.nextLine,
                        currentFont: .subheadline,
                        currentWeight: .semibold
                    )
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(context.state.title)
                                .font(.caption)
                                .fontWeight(.semibold)
                                .lineLimit(1)
                            if !context.state.artist.isEmpty {
                                Text(context.state.artist)
                                    .font(.caption2)
                                    .lineLimit(1)
                                    .foregroundStyle(.white.opacity(0.7))
                            }
                        }
                        Spacer()
                        PlayPauseLink(isPlaying: context.state.isPlaying, size: 14)
                    }
                    .foregroundStyle(.white)
                }
            } compactLeading: {
                Image(systemName: "music.note")
                    .foregroundStyle(.white)
            } compactTrailing: {
                Text(currentLine(context))
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

    private func currentLine(
        _ context: ActivityViewContext<MusicFreeActivityAttributes>
    ) -> String {
        return MusicFreeLiveActivityWidget.currentLine(context)
    }

    static func currentLine(
        _ context: ActivityViewContext<MusicFreeActivityAttributes>
    ) -> String {
        let lyric = context.state.lyricLine.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return lyric.isEmpty ? "MusicFree" : lyric
    }
}

private struct ThreeLineLyricView: View {
    let previousLine: String
    let currentLine: String
    let nextLine: String
    var currentFont: Font = .body
    var currentWeight: Font.Weight = .semibold

    var body: some View {
        VStack(spacing: 2) {
            Text(previousLine)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.45))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
            Text(currentLine)
                .font(currentFont)
                .fontWeight(currentWeight)
                .foregroundStyle(.white)
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            Text(nextLine)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(1)
                .frame(maxWidth: .infinity)
        }
    }
}

private struct PlayPauseLink: View {
    let isPlaying: Bool
    var size: CGFloat = 18

    var body: some View {
        Link(destination: togglePlayURL) {
            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                .font(.system(size: size, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: size + 18, height: size + 18)
                .background(
                    Circle().fill(Color.white.opacity(0.16))
                )
        }
        .accessibilityLabel(isPlaying ? "Pause" : "Play")
    }
}

private struct LockScreenLyricView: View {
    let context: ActivityViewContext<MusicFreeActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "music.note")
                    .font(.body)
                VStack(alignment: .leading, spacing: 1) {
                    Text(context.state.title)
                        .font(.headline)
                        .lineLimit(1)
                    if !context.state.artist.isEmpty {
                        Text(context.state.artist)
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.7))
                            .lineLimit(1)
                    }
                }
                Spacer()
                PlayPauseLink(isPlaying: context.state.isPlaying)
            }
            .foregroundStyle(.white)

            ThreeLineLyricView(
                previousLine: context.state.previousLine,
                currentLine: currentLine,
                nextLine: context.state.nextLine,
                currentFont: .system(size: 20),
                currentWeight: .semibold
            )

            ProgressView(value: context.state.progress)
                .progressViewStyle(.linear)
                .tint(.white.opacity(0.85))
        }
        .padding(16)
    }

    private var currentLine: String {
        let lyric = context.state.lyricLine.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return lyric.isEmpty ? "MusicFree" : lyric
    }
}
