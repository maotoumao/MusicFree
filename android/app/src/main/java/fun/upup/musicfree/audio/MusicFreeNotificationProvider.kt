package `fun`.upup.musicfree.audio

import android.content.Context
import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.CommandButton
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import com.google.common.collect.ImmutableList
import `fun`.upup.musicfree.R

/**
 * 通知按钮排布：`[收藏][上一首][播放/暂停][下一首][歌词]`，图标统一为 lucide 线性风格。
 *
 * Media3 的槽位只认「替换上一首 / 替换下一首 / 溢出」三种落法，没有「上一首左侧」，
 * 所以自定义按钮统一声明溢出槽（默认会全部追加在下一首之后），再在这里把标记为 leading 的提到最前
 */
@OptIn(UnstableApi::class)
class MusicFreeNotificationProvider(context: Context) : DefaultMediaNotificationProvider(
    context,
    NotificationIdProvider { DEFAULT_NOTIFICATION_ID },
    DEFAULT_CHANNEL_ID,
    R.string.playback_channel_name,
) {

    override fun getMediaButtons(
        session: MediaSession,
        playerCommands: Player.Commands,
        mediaButtonPreferences: ImmutableList<CommandButton>,
        showPauseButton: Boolean,
    ): ImmutableList<CommandButton> {
        val base = super.getMediaButtons(
            session,
            playerCommands,
            mediaButtonPreferences,
            showPauseButton,
        ).map(::withAppIcon)
        val (leading, rest) = base.partition { button ->
            CustomNotificationButtons.buttonIdOf(button)
                ?.let(CustomNotificationButtons::isLeading) == true
        }
        return ImmutableList.copyOf(leading + rest)
    }

    /**
     * 把 Media3 自建的播放控制按钮换成 app 图标，与两个自定义按钮同一套线性风格。
     * 只改图标：可用性判定、已本地化的名称、槽位都沿用 Media3 的结果
     */
    private fun withAppIcon(button: CommandButton): CommandButton {
        val icon = playbackIconOf(button) ?: return button
        return CommandButton.Builder(CommandButton.ICON_UNDEFINED)
            .setPlayerCommand(button.playerCommand)
            .setCustomIconResId(icon)
            .setDisplayName(button.displayName)
            .setEnabled(button.isEnabled)
            .setSlots(*button.slots.toArray())
            .build()
    }

    /** 自定义按钮（带 sessionCommand）与未知命令返回 null，保持原样 */
    private fun playbackIconOf(button: CommandButton): Int? {
        if (button.sessionCommand != null) return null
        return when (button.playerCommand) {
            Player.COMMAND_SEEK_TO_PREVIOUS,
            Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
            -> R.drawable.ic_notification_previous

            Player.COMMAND_SEEK_TO_NEXT,
            Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
            -> R.drawable.ic_notification_next

            // 播放与暂停共用一个命令，靠 Media3 已选好的预定义图标区分
            Player.COMMAND_PLAY_PAUSE -> when (button.icon) {
                CommandButton.ICON_PAUSE -> R.drawable.ic_notification_pause
                CommandButton.ICON_PLAY -> R.drawable.ic_notification_play
                else -> null
            }

            else -> null
        }
    }
}
