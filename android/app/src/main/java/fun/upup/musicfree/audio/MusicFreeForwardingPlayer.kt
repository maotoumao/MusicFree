package `fun`.upup.musicfree.audio

import androidx.annotation.OptIn
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi

/**
 * 包一层拦截远程 prev/next/stop（通知/锁屏/蓝牙/车机）：
 * - getAvailableCommands / isCommandAvailable 恒声明 prev/next 可用 → 通知按钮永远显示（不看 timeline 窗口数，
 *   解决旧版「单曲无 next 图标」）；
 * - seekToNext/Previous 全拦截 → 只发 onRemote 交 JS（队列 SoT 在 JS，原生不动 curr/next 两槽）；prev 原生本就不持有；
 * - stop → 发 onRemote('stop')（JS 可据此清队列）；实际停由回调里的引擎 stop 完成（含 stopped/seek0/emitState 记账）。
 *
 * 注意：自然 AUTO 过渡（一首播完）由 ExoPlayer 内部推进，不经这些 seekToXxx 拦截，故两槽无缝切歌不受影响。
 */
@OptIn(UnstableApi::class)
class MusicFreeForwardingPlayer(
    player: Player,
    private val onRemoteCommand: (String) -> Unit,
) : ForwardingPlayer(player) {

    override fun getAvailableCommands(): Player.Commands =
        super.getAvailableCommands().buildUpon()
            .addAll(
                Player.COMMAND_SEEK_TO_NEXT,
                Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                Player.COMMAND_SEEK_TO_PREVIOUS,
                Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
            )
            .build()

    override fun isCommandAvailable(command: Int): Boolean = when (command) {
        Player.COMMAND_SEEK_TO_NEXT,
        Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
        Player.COMMAND_SEEK_TO_PREVIOUS,
        Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM,
        -> true
        else -> super.isCommandAvailable(command)
    }

    override fun seekToNext() = onRemoteCommand(CMD_NEXT)
    override fun seekToNextMediaItem() = onRemoteCommand(CMD_NEXT)
    override fun seekToPrevious() = onRemoteCommand(CMD_PREV)
    override fun seekToPreviousMediaItem() = onRemoteCommand(CMD_PREV)
    override fun stop() = onRemoteCommand(CMD_STOP)

    companion object {
        const val CMD_NEXT = "next"
        const val CMD_PREV = "prev"
        const val CMD_STOP = "stop"
    }
}
